import { describe, expect, it, vi } from "vitest";
import parseXML from "./private/parse-xml";
import getGlb from "./private/get-glb";
import getContours, { linesToPolyLines, contourElevations, contourLineOnFace } from "./private/get-contours";
import toGeojsonContours from "./public/to-geojson-contours";
import reprojectGeoJson from "./public/reproject-geojson";
import fs from "fs";

const example_single_surface_landxml_with_sourcedata_breakline = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd" date="2023-11-20" time="12:40:44" version="1.2" language="English" readOnly="false">
	<Units>
		<Imperial areaUnit="squareFoot" linearUnit="foot" volumeUnit="cubicYard" temperatureUnit="fahrenheit" pressureUnit="inchHG" diameterUnit="inch" angularUnit="decimal degrees" directionUnit="decimal degrees"></Imperial>
	</Units>
  <CoordinateSystem desc="NAD83 Missouri State Planes, East Zone, US Foot" ogcWktCode="PROJCS[&quot;MO83-EF&quot;,GEOGCS[&quot;LL83&quot;,DATUM[&quot;NAD83&quot;,SPHEROID[&quot;GRS1980&quot;,6378137.000,298.25722210]],PRIMEM[&quot;Greenwich&quot;,0],UNIT[&quot;Degree&quot;,0.017453292519943295]],PROJECTION[&quot;Transverse_Mercator&quot;],PARAMETER[&quot;false_easting&quot;,820208.333],PARAMETER[&quot;false_northing&quot;,0.000],PARAMETER[&quot;scale_factor&quot;,0.999933333333],PARAMETER[&quot;central_meridian&quot;,-90.50000000000000],PARAMETER[&quot;latitude_of_origin&quot;,35.83333333333333],UNIT[&quot;Foot_US&quot;,0.30480060960122]]" horizontalDatum="NAD83" horizontalCoordinateSystemName="MO83-EF" fileLocation="AutoCAD Map Zone Name"></CoordinateSystem>
	<Project name="C:\\omitted\\acad.dwt"></Project>
	<Application name="Autodesk Civil 3D" desc="Civil 3D" manufacturer="Autodesk, Inc." version="2023" manufacturerURL="www.autodesk.com/civil" timeStamp="2023-11-20T12:40:44"></Application>
	<Surfaces>
		<Surface name="LandXML_test_surface" desc="Description">
			<SourceData>
				<Breaklines>
					<Breakline brkType="standard" desc="Breakline set1">
						<PntList3D>2. 1. 3. 5. 4. 6. 8. 7. 9. 2. 7. 0.</PntList3D>
						<Feature code="BreakLine" source="Autodesk Civil 3D">
							<Property label="weedDistance" value="0.000000"></Property>
							<Property label="weedAngle" value="0.000000"></Property>
							<Property label="supplementDistance" value="0.000000"></Property>
							<Property label="minOrdinateDistance" value="1.000000"></Property>
						</Feature>
					</Breakline>
				</Breaklines>
			</SourceData>
			<Definition surfType="TIN" area2DSurf="18." area3DSurf="33.674916480965" elevMax="9." elevMin="0.">
				<Pnts>
					<P id="5">2. 1. 3.</P>
					<P id="6">5. 4. 6.</P>
					<P id="7">8. 7. 9.</P>
					<P id="8">2. 7. 0.</P>
				</Pnts>
				<Faces>
					<F n="2 0 0">8 6 5</F>
					<F n="0 0 1">8 7 6</F>
				</Faces>
			</Definition>
		</Surface>
	</Surfaces>
</LandXML>`;

const example_multi_surface_landxml = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd" date="2023-11-20" time="13:52:34" version="1.2" language="English" readOnly="false">
	<Units>
		<Imperial areaUnit="squareFoot" linearUnit="foot" volumeUnit="cubicYard" temperatureUnit="fahrenheit" pressureUnit="inchHG" diameterUnit="inch" angularUnit="decimal degrees" directionUnit="decimal degrees"></Imperial>
	</Units>
	<Project name="C:\\omitted\\acad.dwt"></Project>
	<Application name="Autodesk Civil 3D" desc="Civil 3D" manufacturer="Autodesk, Inc." version="2023" manufacturerURL="www.autodesk.com/civil" timeStamp="2023-11-20T13:52:34"></Application>
	<Surfaces>
		<Surface name="LandXML_test_surface_A" desc="Description">
			<Definition surfType="TIN" area2DSurf="18." area3DSurf="33.674916480965" elevMax="9." elevMin="0.">
				<Pnts>
					<P id="5">2. 1. 3.</P>
					<P id="6">5. 4. 6.</P>
					<P id="7">8. 7. 9.</P>
					<P id="8">2. 7. 0.</P>
				</Pnts>
				<Faces>
					<F n="2 0 0">8 6 5</F>
					<F n="0 0 1">8 7 6</F>
				</Faces>
			</Definition>
		</Surface>
		<Surface name="LandXML_test_surface_B" desc="Description">
			<Definition surfType="TIN" area2DSurf="18." area3DSurf="33.674916480965" elevMax="15." elevMin="6.">
				<Pnts>
					<P id="5">8. 7. 9.</P>
					<P id="6">12.242640687119 7. 12.</P>
					<P id="7">16.485281374239 7. 15.</P>
					<P id="8">12.242640687119 11.242640687119 6.</P>
				</Pnts>
				<Faces>
					<F n="2 0 0">8 6 5</F>
					<F n="0 0 1">8 7 6</F>
				</Faces>
			</Definition>
		</Surface>
	</Surfaces>
</LandXML>`;

describe("Parse LandXMLs", () => {
  it("Parse landXML with single surface", async () => {
    const parsedLandXML = await parseXML(example_single_surface_landxml_with_sourcedata_breakline);
    expect(parsedLandXML).toMatchObject([
      {
        sourceFile: "C:\\omitted\\acad.dwt",
        timeStamp: "2023-11-20T12:40:44",
        name: "LandXML_test_surface",
        description: "Description",
        surfaceDefinition: {
          points: [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
            [7, 2, 0],
          ],
          faces: [
            [3, 1, 0],
            [3, 2, 1],
          ],
        },
      },
    ]);
  });

  it("Parse landXML with multiple surfaces", async () => {
    const parsedLandXML = await parseXML(example_multi_surface_landxml);
    expect(parsedLandXML.length).toBe(2);
  });

  it("Parse WKT string from landXML when available", async () => {
    const parsedLandXMLwithWktString = await parseXML(example_single_surface_landxml_with_sourcedata_breakline);
    expect(parsedLandXMLwithWktString[0]?.wktString).toBe(
      `PROJCS["MO83-EF",GEOGCS["LL83",DATUM["NAD83",SPHEROID["GRS1980",6378137.000,298.25722210]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Transverse_Mercator"],PARAMETER["false_easting",820208.333],PARAMETER["false_northing",0.000],PARAMETER["scale_factor",0.999933333333],PARAMETER["central_meridian",-90.50000000000000],PARAMETER["latitude_of_origin",35.83333333333333],UNIT["Foot_US",0.30480060960122]]`
    );

    const parsedLandXMLwithoutWktString = await parseXML(example_multi_surface_landxml);
    expect(parsedLandXMLwithoutWktString[0]?.wktString).toBeUndefined();
  });

  it("Generate glb with custom center", async () => {
    const parsedLandXML = await parseXML(example_single_surface_landxml_with_sourcedata_breakline);

    if (!parsedLandXML[0]) throw "LandXML doesn't have any surfaces";
    const { glb, center } = await getGlb(parsedLandXML[0], [0, 0]);
    expect(center).toMatchObject([0, 0]);
  });

  it("Generate glb with automatic center", async () => {
    const parsedLandXML = await parseXML(example_single_surface_landxml_with_sourcedata_breakline);

    if (!parsedLandXML[0]) throw "LandXML doesn't have any surfaces";
    const { glb, center } = await getGlb(parsedLandXML[0]);
    expect(center).toMatchObject([7, 5]);
  });

  it("Generate valid glb", async () => {
    // Validated via https://gltf-viewer.donmccurdy.com/

    const parsedLandXML = await parseXML(example_single_surface_landxml_with_sourcedata_breakline);
    if (!parsedLandXML[0]) throw "LandXML doesn't have any surfaces";
    const { glb, center } = await getGlb(parsedLandXML[0]);
    expect([...glb]).toMatchObject([
      103, 108, 84, 70, 2, 0, 0, 0, 160, 2, 0, 0, 60, 2, 0, 0, 74, 83, 79, 78, 123, 34, 97, 115, 115, 101, 116, 34, 58,
      123, 34, 103, 101, 110, 101, 114, 97, 116, 111, 114, 34, 58, 34, 103, 108, 84, 70, 45, 84, 114, 97, 110, 115, 102,
      111, 114, 109, 32, 118, 51, 46, 57, 46, 48, 34, 44, 34, 118, 101, 114, 115, 105, 111, 110, 34, 58, 34, 50, 46, 48,
      34, 125, 44, 34, 97, 99, 99, 101, 115, 115, 111, 114, 115, 34, 58, 91, 123, 34, 116, 121, 112, 101, 34, 58, 34,
      86, 69, 67, 51, 34, 44, 34, 99, 111, 109, 112, 111, 110, 101, 110, 116, 84, 121, 112, 101, 34, 58, 53, 49, 50, 54,
      44, 34, 99, 111, 117, 110, 116, 34, 58, 52, 44, 34, 109, 97, 120, 34, 58, 91, 48, 44, 57, 44, 51, 93, 44, 34, 109,
      105, 110, 34, 58, 91, 45, 54, 44, 48, 44, 45, 51, 93, 44, 34, 98, 117, 102, 102, 101, 114, 86, 105, 101, 119, 34,
      58, 48, 44, 34, 98, 121, 116, 101, 79, 102, 102, 115, 101, 116, 34, 58, 48, 125, 44, 123, 34, 116, 121, 112, 101,
      34, 58, 34, 83, 67, 65, 76, 65, 82, 34, 44, 34, 99, 111, 109, 112, 111, 110, 101, 110, 116, 84, 121, 112, 101, 34,
      58, 53, 49, 50, 53, 44, 34, 99, 111, 117, 110, 116, 34, 58, 54, 44, 34, 98, 117, 102, 102, 101, 114, 86, 105, 101,
      119, 34, 58, 49, 44, 34, 98, 121, 116, 101, 79, 102, 102, 115, 101, 116, 34, 58, 48, 125, 93, 44, 34, 98, 117,
      102, 102, 101, 114, 86, 105, 101, 119, 115, 34, 58, 91, 123, 34, 98, 117, 102, 102, 101, 114, 34, 58, 48, 44, 34,
      98, 121, 116, 101, 79, 102, 102, 115, 101, 116, 34, 58, 48, 44, 34, 98, 121, 116, 101, 76, 101, 110, 103, 116,
      104, 34, 58, 52, 56, 44, 34, 98, 121, 116, 101, 83, 116, 114, 105, 100, 101, 34, 58, 49, 50, 44, 34, 116, 97, 114,
      103, 101, 116, 34, 58, 51, 52, 57, 54, 50, 125, 44, 123, 34, 98, 117, 102, 102, 101, 114, 34, 58, 48, 44, 34, 98,
      121, 116, 101, 79, 102, 102, 115, 101, 116, 34, 58, 52, 56, 44, 34, 98, 121, 116, 101, 76, 101, 110, 103, 116,
      104, 34, 58, 50, 52, 44, 34, 116, 97, 114, 103, 101, 116, 34, 58, 51, 52, 57, 54, 51, 125, 93, 44, 34, 98, 117,
      102, 102, 101, 114, 115, 34, 58, 91, 123, 34, 98, 121, 116, 101, 76, 101, 110, 103, 116, 104, 34, 58, 55, 50, 125,
      93, 44, 34, 109, 101, 115, 104, 101, 115, 34, 58, 91, 123, 34, 112, 114, 105, 109, 105, 116, 105, 118, 101, 115,
      34, 58, 91, 123, 34, 97, 116, 116, 114, 105, 98, 117, 116, 101, 115, 34, 58, 123, 34, 80, 79, 83, 73, 84, 73, 79,
      78, 34, 58, 48, 125, 44, 34, 109, 111, 100, 101, 34, 58, 52, 44, 34, 105, 110, 100, 105, 99, 101, 115, 34, 58, 49,
      125, 93, 125, 93, 44, 34, 110, 111, 100, 101, 115, 34, 58, 91, 123, 34, 109, 101, 115, 104, 34, 58, 48, 125, 93,
      44, 34, 115, 99, 101, 110, 101, 115, 34, 58, 91, 123, 34, 110, 111, 100, 101, 115, 34, 58, 91, 48, 93, 125, 93,
      125, 32, 32, 32, 72, 0, 0, 0, 66, 73, 78, 0, 0, 0, 192, 192, 0, 0, 64, 64, 0, 0, 64, 64, 0, 0, 64, 192, 0, 0, 192,
      64, 0, 0, 0, 128, 0, 0, 0, 0, 0, 0, 16, 65, 0, 0, 64, 192, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 64, 3, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0,
    ]);
  });

  it("Connects line segments to polylines correctly", async () => {
    const lineSegments: [[startX: number, startY: number], [endX: number, endY: number]][] = [
      [
        [11, 16],
        [1, 6],
      ],
      [
        [71.0275, 7.65926],
        [83.2749, 0.588191],
      ],
      [
        [61.2475, 27.5882],
        [49, 34.6593],
      ],
      [
        [11, 16],
        [17, 34],
      ],
      [
        [52.0879, 8.79607],
        [71.0275, 7.65926],
      ],
      [
        [17, 34],
        [43, 42],
      ],
      [
        [52.0879, 8.79607],
        [37.6312, 31.8396],
      ],
      [
        [63, 58],
        [43, 42],
      ],
      [
        [17, 47.017],
        [37.6312, 31.8396],
      ],
    ];

    const polylines = linesToPolyLines(lineSegments);
    expect(polylines.length).toBe(3);
    expect(polylines.map((v) => v.length).reduce((a, b) => a + b)).toBe(12);
  });

  it("Generate contour elevations", async () => {
    const twoDecimalNumberString = (_: number) => _.toFixed(2);

    expect(contourElevations(428.01171875, 446.187377929688, 2).map(twoDecimalNumberString)).toMatchObject(
      [430, 432, 434, 436, 438, 440, 442, 444, 446].map(twoDecimalNumberString)
    );

    expect(contourElevations(0.301171875, 2.187377929688, 0.2).map(twoDecimalNumberString)).toMatchObject(
      [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2].map(twoDecimalNumberString)
    );
  });

  it("Large file test", async () => {
    const n = 5; // size of the landXML to process
    const landXmlString = fs.readFileSync(`./src/test_assets/S${n}.xml`, { encoding: "utf-8" });
    let rawContours = await toGeojsonContours(landXmlString, 1);
    const projection =
      "+proj=utm +zone=16 +ellps=GRS80 +towgs84=-0.9738,1.9453,0.5486,-1.3357e-07,-4.872e-08,-5.507e-08,0 +units=m +no_defs +type=crs"; // any

    if (rawContours[0]) {
      const geojson = reprojectGeoJson(rawContours[0].geojson, projection, "WGS84", true);
      // fs.writeFileSync(`./src/test_assets/S${n}_result.json`, JSON.stringify(geojson));
    }
  });
  {
    timeout: -1;
  }
});
