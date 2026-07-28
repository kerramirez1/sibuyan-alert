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

The application performs a startup range request and only enables the archive
when the server returns `206 Partial Content` with a readable `Content-Range`
header. It also reads the PMTiles header, verifies that the archive contains MVT
vector tiles and intersects Sibuyan, and limits Street view to the archive's
actual maximum zoom. Invalid archives automatically use the OSM fallback.

Recommended production response headers:

```text
Accept-Ranges: bytes
Cache-Control: public, max-age=86400, stale-while-revalidate=604800
ETag: "<archive-version>"
Access-Control-Allow-Origin: https://your-application.example
Access-Control-Expose-Headers: Accept-Ranges, Cache-Control, Content-Range, ETag
```

Verify the deployed archive before releasing:

```bash
curl -sS -D - -o /dev/null \
  -H "Range: bytes=0-16383" \
  https://maps.example.gov/sibuyan.pmtiles
```

The response must include status `206` and a value similar to
`Content-Range: bytes 0-16383/<total-size>`. Use versioned archive URLs when
using long-lived immutable caching.

Recommended Sibuyan extraction bounds:

```text
122.45,12.30,122.70,12.55
```

The application automatically falls back to the policy-compliant public OSM
tile endpoint when no PMTiles URL is configured or the configured source fails.
