import { describe, expect, it } from "vitest";
import parseXML from "./private/parse-xml";
import getGlb from "./private/get-glb";
import getContours from "./private/get-contours";
import toGeojsonContours from "./public/to-geojson-contours";
import reprojectGeoJson from "./public/reproject-geojson";

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

  it("Generate contours", async () => {
    const parsedLandXML = await parseXML(example_single_surface_landxml_with_sourcedata_breakline);
    if (!parsedLandXML[0]) throw "LandXML doesn't have any surfaces";
    const a = await getContours(parsedLandXML[0]);
  });

  it("toGeojsonContours returns valid geojson, reprojects correctly to surface defined WKT projection string and keeps original geometry as feature properties", async () => {
    const geojsonSurfaces = await toGeojsonContours(example_single_surface_landxml_with_sourcedata_breakline, 0.5, 0);
    if (!geojsonSurfaces[0]) throw "LandXML doesn't have any surfaces";
    let { geojson } = geojsonSurfaces[0];
    if (!geojsonSurfaces[0]?.wktString) throw "Surface doesn't have a wkt string";
    const reprojectedGeojson = reprojectGeoJson(geojson, geojsonSurfaces[0].wktString, "WGS84");
    expect(JSON.stringify(reprojectedGeojson)).toBe(
      `{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26563961616785,35.801511785265696],[-93.26563961616785,35.801511785265696]]},"properties":{"z":0,"_rawGeometry":{"type":"LineString","coordinates":[[7,2],[7,2]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26563961616785,35.801511785265696]]},"properties":{"z":0,"_rawGeometry":{"type":"LineString","coordinates":[[7,2]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26563961616785,35.801511785265696]]},"properties":{"z":0,"_rawGeometry":{"type":"LineString","coordinates":[[7,2]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564048205965,35.801512451887696],[-93.26563964789665,35.80151269994271],[-93.26564048205965,35.801512451887696]]},"properties":{"z":0.5,"_rawGeometry":{"type":"LineString","coordinates":[[6.75,2.25],[7,2.3333333333333335],[6.75,2.25]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.2656429845486,35.801511707722625],[-93.26564048205965,35.801512451887696]]},"properties":{"z":0.5,"_rawGeometry":{"type":"LineString","coordinates":[[6,2],[6.75,2.25]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564134795146,35.801513118509696],[-93.26563967962547,35.80151361461972],[-93.26564134795146,35.801513118509696]]},"properties":{"z":1,"_rawGeometry":{"type":"LineString","coordinates":[[6.5,2.5],[7,2.6666666666666665],[6.5,2.5]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564635292937,35.80151163017947],[-93.26564134795146,35.801513118509696]]},"properties":{"z":1,"_rawGeometry":{"type":"LineString","coordinates":[[5,2],[6.5,2.5]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.2656422138433,35.80151378513169],[-93.26563971135425,35.80151452929674],[-93.2656422138433,35.80151378513169]]},"properties":{"z":1.5,"_rawGeometry":{"type":"LineString","coordinates":[[6.25,2.75],[7,3],[6.25,2.75]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564972131011,35.801511552636214],[-93.2656422138433,35.80151378513169]]},"properties":{"z":1.5,"_rawGeometry":{"type":"LineString","coordinates":[[4,2],[6.25,2.75]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564307973514,35.80151445175366],[-93.26563974308306,35.80151544397374],[-93.26564307973514,35.80151445175366]]},"properties":{"z":2,"_rawGeometry":{"type":"LineString","coordinates":[[6,3],[7,3.333333333333333],[6,3]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565308969086,35.801511475092845],[-93.26564307973514,35.80151445175366]]},"properties":{"z":2,"_rawGeometry":{"type":"LineString","coordinates":[[3,2],[6,3]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.265643945627,35.801515118375626],[-93.26563977481187,35.80151635865076],[-93.265643945627,35.801515118375626]]},"properties":{"z":2.5,"_rawGeometry":{"type":"LineString","coordinates":[[5.75,3.25],[7,3.666666666666667],[5.75,3.25]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565645807156,35.8015113975494],[-93.265643945627,35.801515118375626]]},"properties":{"z":2.5,"_rawGeometry":{"type":"LineString","coordinates":[[2,2],[5.75,3.25]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564481151887,35.8015157849976],[-93.26563980654068,35.801517273327775],[-93.26564481151887,35.8015157849976]]},"properties":{"z":3,"_rawGeometry":{"type":"LineString","coordinates":[[5.5,3.5],[7,4],[5.5,3.5]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565982645228,35.80151132000585],[-93.26564481151887,35.8015157849976]]},"properties":{"z":3,"_rawGeometry":{"type":"LineString","coordinates":[[1,2],[5.5,3.5]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564567741076,35.80151645161955],[-93.26563983826948,35.80151818800479],[-93.26564567741076,35.80151645161955]]},"properties":{"z":3.5,"_rawGeometry":{"type":"LineString","coordinates":[[5.25,3.75],[7,4.333333333333334],[5.25,3.75]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565818985544,35.801512730793135],[-93.26564567741076,35.80151645161955]]},"properties":{"z":3.5,"_rawGeometry":{"type":"LineString","coordinates":[[1.5,2.5],[5.25,3.75]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564654330267,35.8015171182415],[-93.2656398699983,35.801519102681794],[-93.26564654330267,35.8015171182415]]},"properties":{"z":4,"_rawGeometry":{"type":"LineString","coordinates":[[5,4],[7,4.666666666666666],[5,4]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565655325855,35.8015141415804],[-93.26564654330267,35.8015171182415]]},"properties":{"z":4,"_rawGeometry":{"type":"LineString","coordinates":[[2,3],[5,4]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564740919459,35.80151778486345],[-93.26563990172711,35.801520017358804],[-93.26564740919459,35.80151778486345]]},"properties":{"z":4.5,"_rawGeometry":{"type":"LineString","coordinates":[[4.75,4.25],[7,5],[4.75,4.25]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565491666162,35.80151555236764],[-93.26564740919459,35.80151778486345]]},"properties":{"z":4.5,"_rawGeometry":{"type":"LineString","coordinates":[[2.5,3.5],[4.75,4.25]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.2656482750865,35.801518451485386],[-93.26563993345593,35.80152093203583],[-93.2656482750865,35.801518451485386]]},"properties":{"z":5,"_rawGeometry":{"type":"LineString","coordinates":[[4.5,4.5],[7,5.333333333333334],[4.5,4.5]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565328006461,35.80151696315486],[-93.2656482750865,35.801518451485386]]},"properties":{"z":5,"_rawGeometry":{"type":"LineString","coordinates":[[3,4],[4.5,4.5]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564914097847,35.801519118107315],[-93.26563996518473,35.80152184671284],[-93.26564914097847,35.801519118107315]]},"properties":{"z":5.5,"_rawGeometry":{"type":"LineString","coordinates":[[4.25,4.75],[7,5.666666666666667],[4.25,4.75]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565164346754,35.801518373942045],[-93.26564914097847,35.801519118107315]]},"properties":{"z":5.5,"_rawGeometry":{"type":"LineString","coordinates":[[3.5,4.5],[4.25,4.75]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565000687042,35.80151978472924],[-93.26563999691355,35.80152276138983],[-93.26565000687042,35.80151978472924]]},"properties":{"z":6,"_rawGeometry":{"type":"LineString","coordinates":[[4,5],[7,6],[4,5]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26565000687042,35.80151978472924]]},"properties":{"z":6,"_rawGeometry":{"type":"LineString","coordinates":[[4,5]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564002864237,35.80152367606685],[-93.26564837027324,35.80152119551639],[-93.26564002864237,35.80152367606685]]},"properties":{"z":6.5,"_rawGeometry":{"type":"LineString","coordinates":[[7,6.333333333333333],[4.5,5.5],[7,6.333333333333333]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564006037118,35.80152459074385],[-93.26564673367601,35.80152260630353],[-93.26564006037118,35.80152459074385]]},"properties":{"z":7,"_rawGeometry":{"type":"LineString","coordinates":[[7,6.666666666666667],[5,6],[7,6.666666666666667]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564009210001,35.80152550542086],[-93.2656450970787,35.80152401709066],[-93.26564009210001,35.80152550542086]]},"properties":{"z":7.5,"_rawGeometry":{"type":"LineString","coordinates":[[7,7],[5.5,6.5],[7,7]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564012382883,35.80152642009788],[-93.26564346048136,35.801525427877756],[-93.26564012382883,35.80152642009788]]},"properties":{"z":8,"_rawGeometry":{"type":"LineString","coordinates":[[7,7.333333333333333],[6,7],[7,7.333333333333333]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.26564015555766,35.80152733477488],[-93.26564182388395,35.801526838664834],[-93.26564015555766,35.80152733477488]]},"properties":{"z":8.5,"_rawGeometry":{"type":"LineString","coordinates":[[7,7.666666666666666],[6.5,7.5],[7,7.666666666666666]]}}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-93.2656401872865,35.80152824945189],[-93.2656401872865,35.80152824945189]]},"properties":{"z":9,"_rawGeometry":{"type":"LineString","coordinates":[[7,8],[7,8]]}}}]}`
    );
  });
});
