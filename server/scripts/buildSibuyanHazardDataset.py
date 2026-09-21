#!/usr/bin/env python3
"""Subset a DOST Project NOAH hazard shapefile to Sibuyan Island.

One script for every hazard layer, because they differ only in three things: the
shapefile, the name of the class field, and which classes matter. The Project
NOAH release is not consistent about the field name — the landslide layer uses
`LH`, the flood and storm-surge layers use `HAZ` — so the field is a parameter
rather than an assumption.

Example, for the landslide layer:

    curl -L -o romblon.zip \\\\
      "https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps/resolve/main/Landslide/Romblon.zip"
    unzip -o romblon.zip -d romblon
    python buildSibuyanHazardDataset.py \\\\
      --shapefile romblon/Romblon_LandslideHazards.shp \\\\
      --field LH --classes 2 3 \\\\
      --output ../data/noah-sibuyan-landslide-hazards.geojson

Requires `pyshp` and `shapely`.

Why this is done per polygon rather than per hazard class
--------------------------------------------------------
The source shapefiles hold one dissolved MultiPolygon per class, and some hold
hundreds of thousands of parts. Dissolving or intersecting a class-level geometry
of that size exhausts memory, so the script bbox-rejects and processes one small
polygon at a time. That is cheap, and it also means an invalid ring is dropped on
its own instead of poisoning the whole class.

Why the result is simplified
----------------------------
The unsimplified Sibuyan landslide subset alone is 15.6 MB of GeoJSON, which is
not a reasonable thing to hand a browser on the connections this system targets.
Simplifying to about 33 m keeps the payload shippable while staying far finer
than the scale of the source survey.

Why the pieces are unioned and snap-rounded
-------------------------------------------
Two consumers read this file, and they disagree about what counts as valid:
MapLibre renders it in the browser and is extremely forgiving, while MongoDB
indexes it with 2dsphere, which is backed by S2 and rejects anything but a
strictly simple polygon set. S2 refuses, for example, a ring vertex that sits
exactly on another edge of the same ring ("Loop is not valid ... Edges 3 and 5
cross") or a hairline hole that crosses its own shell ("Secondary loops not
contained by first exterior loop") — both of which GEOS happily calls valid.

Rounding coordinates to a fixed grid is what manufactures those defects, so
rounding cannot be the last step. `assemble()` therefore unions the class's
pieces and snap-rounds them with GEOS's precision reducer, which re-nodes the
result after snapping: T-junctions between rings become shared vertices, and a
hole that only clipped its shell is absorbed into it. The written coordinates
are then already grid-aligned, so serialising them cannot re-break them.
"""

import argparse
import json
import os
import sys

import shapefile
from shapely import make_valid, set_precision, unary_union
from shapely.geometry import Polygon, box
from shapely.geometry.polygon import orient

# Clip box for the committed Sibuyan layers.
#
# Deliberately WIDER than the server's operational bounds (`getSibuyanBounds()`:
# lng 122.45–122.70, lat 12.30–12.55). The island's true extent — measured from
# the PSA barangay boundaries — is lng 122.4233–122.6988, lat 12.2674–12.5057,
# so clipping to the operational box truncated the hazard polygons along two
# straight lines (at 122.45 and 12.30) and left the island's western and southern
# margins with no hazard at all on the map. The clip exists only to reject the
# rest of Romblon province cheaply (Tablas, Romblon Island, Corcuera and Banton
# all sit west of this box, so no island masking is needed); it must not cut the
# island itself.
#
# Note that coverage is per-hazard, not per-province: the Romblon flood archive
# stops at 122.33 and contains nothing for Sibuyan, so a flood layer cannot be
# built from this source. Always check the reported polygon count before
# assuming an empty result means "no hazard here".
SIBUYAN_CLIP_BBOX = (122.42, 12.26, 122.70, 12.51)

# ~33 m at this latitude.
DEFAULT_TOLERANCE = 0.0003

# Snap grid, about 0.1 m — an order of magnitude below the simplification
# tolerance, so snapping cannot move a vertex that simplification decided to
# keep.
COORD_GRID = 0.000001

# A part smaller than this (in square degrees; 1e-13 is roughly a tenth of a
# square metre) is survey noise rather than a hazard patch, and carrying it costs
# an index entry that can only ever answer "hazard here" for a point nothing can
# hit.
MIN_PART_AREA = 1e-13


def ring_passes_bbox(ring, bbox):
    """Cheap rejection before any geometry work is attempted."""
    xs = [point[0] for point in ring]
    ys = [point[1] for point in ring]
    return not (
        max(xs) < bbox[0]
        or min(xs) > bbox[2]
        or max(ys) < bbox[1]
        or min(ys) > bbox[3]
    )


def polygon_parts(geometry):
    """Every Polygon inside a shapely geometry, whatever its type.

    Repair (`make_valid`) can hand back a GeometryCollection mixing polygons with
    the linework it could not keep, so callers cannot assume MultiPolygon.
    """
    if geometry is None or geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type == "MultiPolygon":
        return list(geometry.geoms)
    return [
        part for part in getattr(geometry, "geoms", [])
        if part.geom_type == "Polygon" and not part.is_empty
    ]


def coordinates_of(polygon):
    """GeoJSON ring arrays for one polygon, wound per RFC 7946.

    Exterior counter-clockwise, holes clockwise. The coordinates are already
    snapped to `COORD_GRID`, so rounding here only trims float noise and cannot
    introduce a new topology defect.
    """
    oriented = orient(polygon, 1.0)
    rings = [oriented.exterior, *oriented.interiors]
    return [
        [[round(x, 6), round(y, 6)] for x, y in ring.coords]
        for ring in rings
    ]


def assemble(pieces):
    """Class geometry as index-safe polygon coordinate arrays.

    Union first: the pieces are separate dissolved parts, so unioning them both
    drops the overlaps that simplification can introduce between neighbours and
    nodes their shared edges. Then snap-round, which repairs the grid-rounding
    damage described in the module docstring. A piece that survives neither is
    dropped rather than shipped.
    """
    merged = unary_union(pieces)
    snapped = set_precision(merged, COORD_GRID)
    if not snapped.is_valid:
        snapped = make_valid(snapped)

    polygons = []
    for part in polygon_parts(snapped):
        if part.area <= MIN_PART_AREA:
            continue
        polygons.append(coordinates_of(part))
    return polygons


def build(shapefile_path, field, bbox, tolerance, keep_classes):
    """Returns {hazard_class: [polygon_coordinates, ...]} and a per-class drop count."""
    reader = shapefile.Reader(shapefile_path)
    # pyshp 3.x yields Field objects rather than (name, type) tuples, so index
    # the name instead of unpacking.
    field_names = [field[0] for field in reader.fields[1:]]
    if field not in field_names:
        raise SystemExit(
            f"Expected a '{field}' hazard field in {shapefile_path}; found {field_names}."
        )

    bounds = box(*bbox)
    parts_by_class = {}
    dropped = {}

    for shape_record in reader.iterShapeRecords():
        hazard_class = int(shape_record.record.as_dict()[field])
        if hazard_class not in keep_classes:
            continue

        shape = shape_record.shape
        points, part_starts = shape.points, list(shape.parts) + [len(shape.points)]
        parts = parts_by_class.setdefault(hazard_class, [])
        dropped[hazard_class] = 0

        for index in range(len(part_starts) - 1):
            ring = points[part_starts[index]:part_starts[index + 1]]
            if len(ring) < 4 or not ring_passes_bbox(ring, bbox):
                continue

            try:
                polygon = Polygon(ring)
                if not polygon.is_valid:
                    polygon = make_valid(polygon)

                clipped = polygon.intersection(bounds)
                if clipped.is_empty:
                    dropped[hazard_class] += 1
                    continue

                simplified = clipped.simplify(tolerance, preserve_topology=True)
                if simplified.is_empty:
                    dropped[hazard_class] += 1
                    continue

                parts.extend(polygon_parts(simplified))
            except Exception:
                dropped[hazard_class] += 1

    collected = {}
    for hazard_class, parts in parts_by_class.items():
        if not parts:
            continue
        kept = assemble(parts)
        if kept:
            collected[hazard_class] = kept

    return collected, dropped


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--shapefile', required=True, help='path to the extracted shapefile')
    parser.add_argument('--output', required=True, help='where to write the Sibuyan subset')
    parser.add_argument('--field', default='HAZ', help="hazard class field name (default HAZ; landslide uses LH)")
    parser.add_argument(
        '--classes', type=int, nargs='+', required=True,
        help='hazard classes to keep',
    )
    parser.add_argument(
        '--tolerance', type=float, default=DEFAULT_TOLERANCE,
        help=f'simplification tolerance in degrees (default {DEFAULT_TOLERANCE}, about 33 m)',
    )
    parser.add_argument(
        '--bbox', type=float, nargs=4, default=SIBUYAN_CLIP_BBOX,
        metavar=('MIN_LNG', 'MIN_LAT', 'MAX_LNG', 'MAX_LAT'),
        help=(
            'clip box as minLng minLat maxLng maxLat '
            f'(default {SIBUYAN_CLIP_BBOX}, the whole island)'
        ),
    )
    args = parser.parse_args()

    min_lng, min_lat, max_lng, max_lat = args.bbox
    if min_lng >= max_lng or min_lat >= max_lat:
        raise SystemExit(f'Invalid --bbox {args.bbox}: expected minLng minLat maxLng maxLat')
    clip_bbox = (min_lng, min_lat, max_lng, max_lat)

    if not os.path.exists(args.shapefile):
        raise SystemExit(f'Shapefile not found: {args.shapefile}')

    print(f'Reading {args.shapefile}')
    print(f"Field '{args.field}', classes {args.classes}, tolerance {args.tolerance}")
    print(f'Clip box: {clip_bbox}')

    collected, dropped = build(
        args.shapefile, args.field, clip_bbox, args.tolerance, set(args.classes)
    )

    missing = set(args.classes) - set(collected)
    if missing:
        raise SystemExit(
            f'No polygons found for class(es): {sorted(missing)}. '
            'This usually means the source does not cover Sibuyan Island at all — '
            'check the archive bounding box before assuming the layer is empty.'
        )

    features = []
    for hazard_class in sorted(collected):
        polygons = collected[hazard_class]
        if not polygons:
            raise SystemExit(f'Class {hazard_class} produced no polygons inside the Sibuyan bounding box')
        features.append({
            'type': 'Feature',
            'properties': {'haz': hazard_class},
            'geometry': {'type': 'MultiPolygon', 'coordinates': polygons},
        })
        print(f'  class {hazard_class}: kept {len(polygons)} polygons, dropped {dropped[hazard_class]}')

    with open(args.output, 'w') as handle:
        json.dump({'type': 'FeatureCollection', 'features': features}, handle, separators=(',', ':'))

    total_points = sum(
        len(ring)
        for feature in features
        for polygon in feature['geometry']['coordinates']
        for ring in polygon
    )
    print(f'\nWrote {args.output}: {os.path.getsize(args.output) / 1024 / 1024:.2f} MB, {total_points} points')
    return 0


if __name__ == '__main__':
    sys.exit(main())
