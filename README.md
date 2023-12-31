# LandXML Parser for Contour Geojson and 3D Models

Easily transform LandXML surfaces into stunning GeoJSON contours or immersive GLB models to explore within threeJS or any popular 3D software.

### Features

- **toGlb:** Generate GLB models from LandXML surfaces.
- **toGeojsonContours:** Convert LandXML data into detailed contour GeoJSON representations.
- **reprojectGeojson:** Effortlessly reproject GeoJSON data to desired projection using `proj4`

### Example: Retrieve GeoJSON Contours

```typescript
import { toGeojsonContours, reprojectGeoJson } from "landxml";

const loadGeojson = async () => {
    const landXmlString = "<?xml version="1.0"?>...</LandXML>";
    const contourInterval = 2;
    const geojsonSurfaces = await toGeojsonContours(landXmlString, contourInterval);

    // Retrieve geojson with raw LandXML coordinates
    let { geojson, wktString } = geojsonSurfaces[0];

    // Reproject GeoJSON to a desired coordinate system (e.g., WGS84)
    const targetCoordinateSystem = wktString || "WGS84";
    const keepOriginalGeometryAsFeatureProperties = false;
    return reprojectGeoJson(geojson, wktString, targetCoordinateSystem, keepOriginalGeometryAsFeatureProperties);
}
```

### Example: Convert to GLB 3D model

```typescript
import { toGlb } from "landxml";

const LandXml2GlbModel = async () => {
    const landXmlString = "<?xml version="1.0"?>...</LandXML>";

    // Define how the model's origin should be positioned (options: "origin" | "auto" | [x: number, y: number])
    const center = "auto";
    const glbSurfaces = await toGlb(landXmlString, center);

    let { download, glb } = glbSurfaces[0];
    download()

    // Alternatively, process the raw binary data from the 'glb' variable (Uint8Array)
}
```
