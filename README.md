# LandXML Parser for Contour GeoJSON and 3D Models

Easily transform LandXML surfaces into GeoJSON contours or GLB 3D models for use in ThreeJS, Cesium, QGIS, or any popular 3D/GIS software.

---

## Features

- **`toGlbAndContours`** — Generate both a GLB model and GeoJSON contours in a single pass (fastest when you need both outputs).
- **`toGlb`** — Generate a GLB 3D model from LandXML surfaces.
- **`toGeojsonContours`** — Convert LandXML surfaces into contour line GeoJSON.
- **`reprojectGeoJson`** — Reproject GeoJSON coordinates to any projection using `mproj`.
- **`parseSurfaces`**, **`surfaceToGlb`**, **`surfaceToContours`**, **`findCenter`** — Lower-level building blocks: parse once, build only what you need, with progress callbacks.

Large files are fine: the parser streams points and faces straight into typed arrays rather than building an object tree of the whole document.

---

## Installation

```bash
npm install landxml
```

## Examples

### Get contours and a GLB model together (recommended)

When you need both outputs, use `toGlbAndContours` — it parses the XML once and shares computed data between both outputs, making it significantly faster than calling `toGlb` and `toGeojsonContours` separately.

```typescript
import { toGlbAndContours, reprojectGeoJson } from "landxml";

const landXmlString = `<?xml version="1.0"?>...<LandXML>...</LandXML>`;

const surfaces = await toGlbAndContours(
  landXmlString,
  2, // contour interval (LandXML units)
  true, // generate outline
  "auto", // GLB center: "auto" | "origin" | [x, y]
);

const { glb, center, geojson, wktString, download } = surfaces[0];

// Download the GLB file in the browser
download();

// Reproject contours from the LandXML CRS to WGS84
const reprojected = reprojectGeoJson(geojson, wktString, "WGS84", false);
```

---

### Get GeoJSON contours only

```typescript
import { toGeojsonContours, reprojectGeoJson } from "landxml";

const landXmlString = `<?xml version="1.0"?>...<LandXML>...</LandXML>`;

const surfaces = await toGeojsonContours(
  landXmlString,
  2, // contour interval (LandXML units)
  true, // include surface outline as a z=0 feature
);

const { geojson, wktString } = surfaces[0];

// Reproject from the LandXML coordinate system to WGS84 for web mapping
const reprojected = reprojectGeoJson(geojson, wktString ?? "WGS84", "WGS84", false);

console.log(reprojected.features.length); // number of contour + outline features
```

---

### Convert to a GLB 3D model

```typescript
import { toGlb } from "landxml";

const landXmlString = `<?xml version="1.0"?>...<LandXML>...</LandXML>`;

const surfaces = await toGlb(
  landXmlString,
  "auto", // centre strategy: "auto" | "origin" | [x, y]
);

const { glb, center, download } = surfaces[0];

// Trigger a browser download of the .glb file
download();

// Or use the raw binary (Uint8Array) directly — e.g. load into Three.js
const loader = new GLTFLoader();
loader.parse(glb.buffer, "", (gltf) => {
  scene.add(gltf.scene);
});
```

---

### Work with a specific surface in a multi-surface LandXML

LandXML files can contain multiple surfaces. Use `surfaceId` to select one by name or by index.

```typescript
import { toGeojsonContours } from "landxml";

const landXmlString = `<?xml version="1.0"?>...<LandXML>...</LandXML>`;

// By name
const byName = await toGeojsonContours(landXmlString, 2, true, "ExistingGround");

// By index (0-based)
const byIndex = await toGeojsonContours(landXmlString, 2, true, 1);
```

---

### Reproject GeoJSON

`reprojectGeoJson` wraps `mproj` and works with both WKT strings (exported by Civil 3D when a drawing is geo-referenced) and standard proj4 definition strings.

```typescript
import { reprojectGeoJson } from "landxml";

// wktString is available on every surface returned by toGeojsonContours / toGlbAndContours
const reprojected = reprojectGeoJson(
  geojson,
  wktString, // source CRS — WKT or proj4 string
  "WGS84", // target CRS (default)
  true, // keep original geometry as feature property "_rawGeometry"
);
```

---

### Parse once, build what you need (with progress)

The building blocks behind `toGlbAndContours` are exported too — useful for large files where you want to show progress, or only need some surfaces / outputs.

```typescript
import { parseSurfaces, findCenter, surfaceToGlb, surfaceToContours } from "landxml";

const surfaces = await parseSurfaces(landXmlString, {
  onProgress: (fraction) => console.log(`Parsing ${Math.round(fraction * 100)}%`),
});

const center = findCenter(surfaces); // shared median XY of every surface
for (const surface of surfaces) {
  const glb = await surfaceToGlb(surface, center);
  const contours = await surfaceToContours(surface, 1, true, (fraction) => console.log(surface.name, fraction));
}

// Raw TIN data, in the file's coordinate system and units:
const { points, faces } = surfaces[0].surfaceDefinition; // Float64Array [x, y, z, …], Uint32Array [a, b, c, …]
console.log(surfaces[0].wktString, surfaces[0].linearUnit); // e.g. "PROJCS[…]", "USSurveyFoot"
```

---

## API Reference

### `toGlbAndContours(landXmlString, contourInterval?, generateOutline?, center?, surfaceId?)`

| Parameter         | Type                           | Default  | Description                                        |
| ----------------- | ------------------------------ | -------- | -------------------------------------------------- |
| `landXmlString`   | `string`                       | —        | Raw LandXML XML string                             |
| `contourInterval` | `number`                       | `2`      | Vertical interval between contour lines            |
| `generateOutline` | `boolean`                      | `true`   | Append surface boundary as a `z=0` GeoJSON feature |
| `center`          | `"auto" \| "origin" \| [x, y]` | `"auto"` | GLB model origin strategy                          |
| `surfaceId`       | `string \| number`             | `-1`     | Surface name or index; `-1` returns all surfaces   |

Returns `Promise<GlbAndContoursResult[]>` where each element contains `name`, `description`, `sourceFile`, `timeStamp`, `wktString`, `linearUnit`, `glb`, `center`, `download`, and `geojson`.

---

### `toGeojsonContours(landXmlString, contourInterval?, generateOutline?, surfaceId?)`

| Parameter         | Type               | Default | Description                                        |
| ----------------- | ------------------ | ------- | -------------------------------------------------- |
| `landXmlString`   | `string`           | —       | Raw LandXML XML string                             |
| `contourInterval` | `number`           | `2`     | Vertical interval between contour lines            |
| `generateOutline` | `boolean`          | `true`  | Append surface boundary as a `z=0` GeoJSON feature |
| `surfaceId`       | `string \| number` | `-1`    | Surface name or index; `-1` returns all surfaces   |

Returns `Promise<{ name, description, sourceFile, timeStamp, wktString?, linearUnit?, geojson }[]>`.

---

### `toGlb(landXmlString, center?, surfaceId?)`

| Parameter       | Type                           | Default  | Description                                                                                                 |
| --------------- | ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| `landXmlString` | `string`                       | —        | Raw LandXML XML string                                                                                      |
| `center`        | `"auto" \| "origin" \| [x, y]` | `"auto"` | GLB model origin strategy. 3D models are sensitive to large coordinates — `"auto"` offsets to the XY median |
| `surfaceId`     | `string \| number`             | `-1`     | Surface name or index; `-1` returns all surfaces                                                            |

Returns `Promise<{ name, description, sourceFile, timeStamp, wktString?, linearUnit?, glb, center, download }[]>`.

---

### `parseSurfaces(landXmlString, options?)`

| Option       | Type                         | Default | Description                                         |
| ------------ | ---------------------------- | ------- | --------------------------------------------------- |
| `surfaceId`  | `string \| number`           | `-1`    | Surface name or 0-based index; `-1` keeps all       |
| `onProgress` | `(fraction: number) => void` | —       | Called as the file is read, with the fraction 0 – 1 |

Returns `Promise<LandXmlSurface[]>`: each has `name`, `description`, `sourceFile`, `timeStamp`, `wktString?`, `linearUnit?` and `surfaceDefinition: { points: Float64Array, faces: Uint32Array }` — `x, y, z` per point (x = easting, y = northing) and three point indices per visible face.

### `findCenter(surfaces, center?)`

The GLB origin for `surfaces`: `"auto"` (default) is the median XY of all their points, `"origin"` is `[0, 0]`, or pass an explicit `[x, y]`.

### `surfaceToGlb(surface, center)`

Returns `Promise<Uint8Array>` — the surface as a GLB, positions relative to `center` with GLTF's y-up axes (`[x, z, -y]`).

### `surfaceToContours(surface, contourInterval?, generateOutline?, onProgress?)`

Returns `Promise<FeatureCollection<LineString, { z }>>` — contour lines, plus the outline as a `z = 0` feature when `generateOutline` (default `true`). `onProgress` gets the fraction of contour levels done.

---

### `reprojectGeoJson(geojson, sourceProjection, targetProjection?, keepOriginalGeometry?)`

| Parameter              | Type                | Default   | Description                                                        |
| ---------------------- | ------------------- | --------- | ------------------------------------------------------------------ |
| `geojson`              | `FeatureCollection` | —         | GeoJSON to reproject                                               |
| `sourceProjection`     | `string`            | —         | Proj4 or WKT string of the source CRS                              |
| `targetProjection`     | `string`            | `"WGS84"` | Proj4 or WKT string of the target CRS                              |
| `keepOriginalGeometry` | `boolean`           | `true`    | Store original coordinates under `feature.properties._rawGeometry` |

Returns the mutated `FeatureCollection` with updated coordinates.

---

## Multi-surface center behaviour

When a LandXML file contains multiple surfaces and `center` is set to `"auto"` (the default), the package computes a **single shared median center** across all surfaces' points. Every GLB produced in that call is offset by the same origin, so the surfaces remain correctly positioned relative to each other in your 3D scene. This happens automatically — no extra configuration is needed.

If you need each surface to be individually centered (e.g. you are processing them in isolation), pass an explicit `[x, y]` pair instead.

---
