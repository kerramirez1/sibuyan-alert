# Sibuyan PMTiles deployment

Place a Protomaps-compatible Sibuyan basemap archive here as `sibuyan.pmtiles`,
then configure:

```env
VITE_PMTILES_URL=/maps/sibuyan.pmtiles
```

For production, prefer an HTTPS object-storage/CDN URL rather than committing
the archive to Git. The origin must support byte-range requests and CORS must
allow the deployed application origin. Do not use `Access-Control-Allow-Origin: *`
for a restricted production archive.

Recommended Sibuyan extraction bounds:

```text
122.45,12.30,122.70,12.55
```

The application automatically falls back to the policy-compliant public OSM
tile endpoint when no PMTiles URL is configured or the configured source fails.
