# Boundary source data

`psa-georisk-sibuyan-barangays.geojson` is intentionally kept out of the
client public directory. It is source data for the one-time MongoDB boundary
import, not a public frontend asset.

Run `npm run download:barangay-boundaries`, then
`npm run import:barangay-boundaries` from `server/`. You may set
`SIBUYAN_BOUNDARIES_FILE` to an explicit GeoJSON path for both scripts.
