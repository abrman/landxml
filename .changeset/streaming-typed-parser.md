---
"landxml": minor
---

Much faster, lower-memory parsing for large LandXML files.

- New streaming parser: points and faces are read straight into typed arrays instead of converting the whole document to an object tree, and point ids resolve through a Map (previously a linear `indexOf` per face vertex, quadratic overall). A 21 MB file now parses and contours in ~1 s instead of ~97 s, with less than half the memory. GLB and contour output is unchanged.
- New building blocks for parsing once and building only what you need, with progress callbacks: `parseSurfaces`, `findCenter`, `surfaceToGlb`, `surfaceToContours`, and the `LandXmlSurface` type.
- Results now include `linearUnit` from the file's `<Units>` (e.g. `"USSurveyFoot"`, `"meter"`), and `toGlb` results include `wktString`.
- XML entities in names and attributes are decoded; extra whitespace between point coordinates is tolerated; faces referencing missing points are skipped with a warning; surfaces without points are skipped with a warning.
- Fix: `surfaceId` `0` now selects the first surface (it used to return all surfaces).
- Breaking: removed the `precomputeSurfaceData` export and its `PrecomputedSurfaceData` type (no longer needed — use `parseSurfaces` + `surfaceToGlb` / `surfaceToContours`). Dropped the `xml-js` and `sax` dependencies.
