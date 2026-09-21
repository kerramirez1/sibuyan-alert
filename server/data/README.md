# Source data

## `psa-georisk-sibuyan-barangays.geojson`

Barangay boundary polygons for the three Sibuyan municipalities, used to resolve
a coordinate to its official barangay and municipality.

It is intentionally kept out of the client public directory. It is source data
for the one-time MongoDB boundary import, not a public frontend asset.

Run `npm run download:barangay-boundaries`, then
`npm run import:barangay-boundaries` from `server/`. You may set
`SIBUYAN_BOUNDARIES_FILE` to an explicit GeoJSON path for both scripts.

## `noah-sibuyan-*.geojson` — hazard layers

DOST Project NOAH hazard polygons for Sibuyan Island, one file per dataset.
Every layer is registered in `config/hazardDatasets.js`, which is the single
place that says what each one is; this file records how they were produced.

| File | Source | Classes | Registered |
|---|---|---|---|
| `noah-sibuyan-landslide-hazards.geojson` | NOAH Landslide Hazard Maps | `LH` 2, 3 | yes |
| `noah-sibuyan-storm-surge-ssa1..4.geojson` | NOAH Storm Surge Hazard Maps (PAGASA) | `HAZ` 1, 2, 3 | no — on disk, unregistered |

Only a **registered** dataset (`config/hazardDatasets.js`) is imported by
`import:hazards`, served by the API, or drawn on the map. The storm surge
advisories were deliberately unregistered: they are a coastal scenario rather
than a zone-placement signal, and the hazard reference layers are an
administrative aid for the admin Risk Zones workspace. Their geometry is kept
here so a future release can re-register them without re-downloading.

All are **ODC-ODbL**, WGS 84 / EPSG:4326, and derived by subsetting the Romblon
province archive to the island's own extent and simplifying to about 33 m.

### Coverage is per hazard, not per province

This is the single most important thing to know before adding a layer. The
upstream release is organised by province, but a province archive does **not**
imply the hazard was modelled there.

- **Flood is deliberately absent.** NOAH's flood LiDAR covers only the 18 major
  river basins, and Sibuyan is not one of them. The Romblon flood archive stops
  at longitude 122.33 — Tablas and Romblon Island — and contains **0 of 25,426**
  polygons inside the Sibuyan bounding box. A flood layer built from this source
  would render as an empty overlay, which on a hazard map reads as "no flood
  risk here". That is worse than no layer, so it is not shipped.
- The 5-year and 25-year flood archives are **not mirrored for Romblon at all**;
  only the 100-year set exists, and it does not reach Sibuyan either.
- Storm surge **is** modelled for Sibuyan (all coastal provinces are), but its
  advisories are no longer registered as layers — see the table above.

Always check the polygon count before trusting a new dataset. The build script
refuses to write a class that produced no polygons for exactly this reason.

### Class semantics differ per hazard

Class numbers are not comparable across hazards. Landslide `2` is a
susceptibility band ("build only with slope protection"); a storm surge `2` is a
modelled inundation depth (0.5–1.5 m). Each dataset therefore carries its own
`classLabels` and `classDescriptions`, quoted from the published metadata rather
than inferred from the numbers. (The surge files are still reproduced by the
build steps below; they are simply not registered.)

Landslide ships only classes 2 and 3. In the Romblon source, low susceptibility
is 37,601 of 41,768 polygons inside the Sibuyan box — about 85% of the payload —
and it is the class with the least operational consequence. Regenerate with
`--classes 1 2 3` if the full susceptibility surface is ever needed.

### Regenerating

The upstream release is mirrored by BetterGovPH, because the originating services
are not openly consumable — the MGB folder on the PHIVOLCS ArcGIS server answers
`499 Token Required`, and the only public landslide service there is
earthquake-induced rather than rain-induced.

```bash
# Landslide
curl -L -o Romblon.zip \
  "https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps/resolve/main/Landslide/LandslideHazards/Romblon.zip"
unzip -o Romblon.zip -d romblon
python scripts/buildSibuyanHazardDataset.py \
  --shapefile romblon/Romblon_LandslideHazards.shp \
  --field LH --classes 2 3 \
  --output data/noah-sibuyan-landslide-hazards.geojson

# Storm surge, one per advisory (1..4). Not registered — kept so the on-disk
# files can be reproduced; `import:hazards` will not read them.
curl -L -o ssa1.zip \
  "https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps/resolve/main/Storm%20Surge/StormSurgeAdvisory1/Romblon.zip"
unzip -o ssa1.zip -d ssa1
python scripts/buildSibuyanHazardDataset.py \
  --shapefile ssa1/Romblon_StormSurge_SSA1.shp \
  --field HAZ --classes 1 2 3 \
  --output data/noah-sibuyan-storm-surge-ssa1.geojson

# Load everything into MongoDB and verify the geospatial index
npm run import:hazards
```

`--field` is a parameter because the release is not consistent: landslide uses
`LH`, flood and storm surge use `HAZ`, and the published landslide metadata
claims `HAZ` while the shipped shapefile uses `LH`. Trust the file, not the
documentation.

The build script needs `pyshp` and `shapely`, and must be run from the directory
holding the extracted archives. It works per polygon rather than per class:
dissolving a class-level MultiPolygon of this size exhausts memory, while
clipping one small polygon at a time is cheap.

The committed files are derived, simplified artifacts (0.51 MB and 0.25–0.27 MB
each) rather than the 45.6 MB and 4.5–6 MB source archives, so they are committed
and the feature works on a fresh clone. The script reproduces them
byte-for-byte.

Two consumers read these files and they disagree about what is valid. MapLibre
draws them in a browser and is forgiving; MongoDB indexes them with 2dsphere,
which is backed by S2 and accepts only strictly simple polygons. Rounding
coordinates to a fixed grid is what breaks that: a vertex can land exactly on
another edge of its own ring, or a hairline hole can cross the shell it is meant
to sit inside, and GEOS calls both valid. The script therefore unions each
class's parts and then snap-rounds the result, which re-nodes it after snapping.
Do not replace that with a plain `round()` — the import then fails with
`Secondary loops not contained by first exterior loop` or `Loop is not valid ...
Edges cross`.

`SIBUYAN_HAZARD_DATA_DIR` overrides the directory the service and importer read
from.

### Why the import verifies specific points

`scripts/importHazardAreas.js` resolves a small set of coordinates after
importing each dataset and fails if any lands in the wrong class. Each was
derived as the representative interior point of a polygon in that class, so a
mismatch means the geometry genuinely changed — not that the check is flaky. A
hazard layer that silently loses a class renders as "no hazard here", which is
the one direction this must never be wrong in. Each dataset also asserts at least
one point is in **no** class, which is what catches an over-broad geometry.
