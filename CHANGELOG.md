# landxml

## 0.6.1

### Patch Changes

- 6c547e2: deploy options fix

## 0.6.0

### Minor Changes

- 330e3e8: Introduced web workers for some of the processing heavy workflows

## 0.5.2

### Patch Changes

- 6cafe85: Bugfix parsing landxml's without extra triangulated faces

## 0.5.1

### Patch Changes

- 2d30d02: Fix: Edge case generating contour lines that are shared between multiple faces

## 0.5.0

### Minor Changes

- df95e64: Added ability to generate surface outline geojson

### Patch Changes

- df95e64: LandXML Face with with "i" attribute equal to "1" will now be correctly ignored
- df95e64: Improved contour generation algorithm

## 0.4.2

### Patch Changes

- fbd9682: Contour elevations from surface min/max elevations and increment are now calculated correctly (bugfix).

## 0.4.1

### Patch Changes

- 4edb0de: Contour elevations from surface min/max elevations and increment are now calculated correctly.

## 0.4.0

### Minor Changes

- e2e4513: Rewrote contour lines polyline builder

## 0.3.0

### Minor Changes

- 0fe8297: Added homepage & repository to `package.json`

## 0.2.0

### Minor Changes

- ae3bcf7: Swapped xml reader package from `xml2json` to `xml-js`
- ae3bcf7: Added `glb` download example into README.md

### Patch Changes

- ae3bcf7: Fixed dependency list

## 0.1.0

### Minor Changes

- e0fa5a8: Added tests
- e0fa5a8: Added contour lines geojson export
- e0fa5a8: Added GLB file export
- e0fa5a8: Exposed functions for extenal use
- e0fa5a8: Added README.md
- e0fa5a8: Added LandXML parser

### Patch Changes

- 4e2c14f: Fixed test imports
- 3c53b08: Fixed types on toGeojsonContours to reflect that surface may have a wktString
- 3c53b08: Updated README GeoJSON Contours code example
