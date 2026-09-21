/**
 * Registry of NOAH hazard datasets available for Sibuyan Island.
 *
 * Every hazard layer in this system is one entry here. The importer, the
 * service, the API and the map all read this registry rather than hard-coding a
 * layer, because the Project NOAH release is a family of datasets that differ
 * only in their source file, their class-field name and which classes matter.
 *
 * ## Coverage is per-hazard, not per-province
 *
 * This is the single most important thing to know before adding a layer. The
 * releases are organised by province, but a province archive does **not** imply
 * the hazard was modelled there:
 *
 * - **Flood is deliberately absent.** NOAH's flood LiDAR covers only the 18
 *   major river basins, and Sibuyan is not one of them. The Romblon flood
 *   archive stops at longitude 122.33 — Tablas and Romblon Island — and
 *   contains **0 of 25,426** polygons inside the Sibuyan bounding box. A flood
 *   layer built from this source would render as an empty overlay, which on a
 *   hazard map reads as "no flood risk here". That is worse than no layer.
 * - **The 5-year and 25-year flood archives are not mirrored for Romblon at
 *   all** — only the 100-year set.
 *
 * ## Storm surge is intentionally not registered
 *
 * The Project NOAH storm surge advisories (SSA 1–4) were previously registered
 * and drawn as a blue overlay. They are deliberately not part of this registry:
 * the hazard reference layers are an administrative aid for placing high-risk
 * zones, storm surge is a coastal scenario rather than a zone-placement signal,
 * and the layers belong on the admin Risk Zones workspace alone. That includes
 * their point lookup, so a coastal pin no longer suggests a flood-prone zone.
 * The source geometry remains under `server/data/` and can be re-registered by
 * adding entries back here; nothing reads it while it is absent.
 *
 * Verify coverage by polygon count before trusting a new dataset; the build
 * script refuses to write a class that produced no polygons, for this reason.
 *
 * ## Class semantics differ per hazard
 *
 * The class numbers are not comparable across hazards. Landslide `2` is a
 * susceptibility band; a surge `2` is a modelled inundation depth. Each dataset
 * therefore carries its own `classLabels`, taken from the published metadata
 * rather than inferred from the numbers.
 *
 * Licence for every dataset here: **ODC-ODbL** — attribution required, and
 * derived work must carry the same licence.
 */

const NOAH_LICENCE = 'ODC-ODbL';
const NOAH_SOURCE_URL = 'https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps';

export const HAZARD_DATASETS = Object.freeze({
    landslide: Object.freeze({
        id: 'landslide',
        hazardType: 'landslide',
        label: 'Landslide',
        shortLabel: 'Landslide',
        description: 'Landslide susceptibility on slopes and their runout zones.',
        file: 'noah-sibuyan-landslide-hazards.geojson',
        /**
         * Medium and high only. In the Romblon source, low susceptibility is
         * 37,601 of 41,768 polygons inside the Sibuyan box — about 85% of the
         * payload — and it is the class with the least operational consequence
         * ("build only with continuous monitoring"). Regenerate with
         * `--classes 1 2 3` if the full susceptibility surface is ever needed.
         */
        classes: [2, 3],
        classLabels: { 1: 'Low', 2: 'Medium', 3: 'High' },
        classDescriptions: {
            1: 'Build only with continuous monitoring',
            2: 'Build only with slope protection and intervention',
            3: 'No dwelling zone',
        },
        zoneType: 'landslide_prone',
        suggestZoneTypeOnClasses: [3],
        source: 'DOST Project NOAH Landslide Hazard Maps',
        sourceUrl: NOAH_SOURCE_URL,
        sourceVersion: 'Romblon_LandslideHazards.shp (2021-10-12)',
        licence: NOAH_LICENCE,
        attribution: 'DOST Project NOAH / PHIVOLCS',
        derivation: 'Subset to the Sibuyan island extent, dissolved and simplified to ~33 m',
    }),
});

export const HAZARD_DATASET_IDS = Object.freeze(Object.keys(HAZARD_DATASETS));

/**
 * The island's geographic extent, used to validate imported hazard geometry.
 *
 * Deliberately WIDER than the operational report bounds (`getSibuyanBounds()`:
 * lng 122.45–122.70, lat 12.30–12.55). Those answer "should a report be accepted
 * here?"; this answers "is this geometry plausibly on Sibuyan?" — and the
 * island, measured from the PSA barangay boundaries, reaches west to 122.4233
 * and south to 12.2674. Validating the hazard data against the operational box
 * rejected the island's own western and southern margins, which is exactly what
 * truncated the layers along straight lines at 122.45 and 12.30.
 *
 * Still far enough from Tablas, Romblon Island, Corcuera and Banton (all west of
 * 122.42) that a wrong-province file is caught.
 */
export const SIBUYAN_HAZARD_EXTENT = Object.freeze({
    minLng: 122.42,
    minLat: 12.26,
    maxLng: 122.70,
    maxLat: 12.51,
});

/**
 * Datasets rendered on the map by default.
 *
 * Kept as an explicit list (rather than "every registered dataset") so a future
 * layer can be registered without being drawn until it is deliberately opted in.
 * Landslide is the only registry entry today, so it is also the only default.
 */
export const DEFAULT_VISIBLE_HAZARD_DATASET_IDS = Object.freeze([
    'landslide',
]);

/** Ordered for display. */
export const HAZARD_DATASET_ORDER = Object.freeze([
    'landslide',
]);

export const getHazardDataset = (datasetId) => HAZARD_DATASETS[datasetId] || null;

export const isKnownHazardDataset = (datasetId) => Object.hasOwn(HAZARD_DATASETS, datasetId);

/**
 * The dataset that should suggest a given zone type at a given class, if any.
 * Lets the geocode response say "this point justifies a landslide-prone zone"
 * without the caller knowing which layer answered.
 */
export const getZoneTypeSuggestion = (datasetId, hazardClass) => {
    const dataset = getHazardDataset(datasetId);
    if (!dataset) return null;
    if (!dataset.suggestZoneTypeOnClasses.includes(Number(hazardClass))) return null;
    return dataset.zoneType;
};

export default {
    HAZARD_DATASETS,
    HAZARD_DATASET_IDS,
    HAZARD_DATASET_ORDER,
    DEFAULT_VISIBLE_HAZARD_DATASET_IDS,
    SIBUYAN_HAZARD_EXTENT,
    getHazardDataset,
    isKnownHazardDataset,
    getZoneTypeSuggestion,
};
