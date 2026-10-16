# Senttra Edge: offline map geometry

Geographic snapshot prepared on 2026-10-15. These are simplified geographic assets, not camera, traffic, or incident data. No runtime services, API keys, new application dependencies, or tile downloads are needed.

## Deliverables

| File | Coverage | Raw / gzip size |
| --- | --- | --- |
| `region.json` | Guatemala, El Salvador, Honduras | 11,488 / 4,637 bytes |
| `honduras.json` | Honduras departments | 44,145 / 15,915 bytes |
| `cortes.json` | Cortés municipalities, with Lago de Yojoa as water | 17,679 / 6,436 bytes |
| `sps.json` | San Pedro Sula streets, street labels, municipal boundary | 396,741 / 151,931 bytes |
| `camera-corridor-coordinates.json` | Existing application's camera reference positions recovered from its own verified map | about 2 KB |

All four maps use `viewBox: "0 0 1000 700"`. Regional maps expose `areas: [{ id, name, path, label: [x, y], centroid: [x, y], bounds: [xmin, ymin, xmax, ymax] }]`. Country/departments/municipalities have no selected, enabled, or highlighted styling in the data. Navigation IDs are `honduras`, `HN-CR`, and `san-pedro-sula`.

`sps.json` exposes:

- `roads: [{ class, path }]`: one combined SVG path per road class. Classes are `primary`, `secondary`, `tertiary`, `residential`, `local`, `trunk`, `motorway`, when present. The source contains 13,327 included street segments.
- `water: [{ class, path }]` and `parks: [{ name, path }]`: currently empty. The additional context queries were unavailable. No water or parks were invented.
- `labels: [{ id, name, class, x, y, lonLat? }]`: 51 actual road names, deduplicated by name. Only render a subset at the initial scale to prevent overlap.
- `boundary: { id, name, path }`: actual San Pedro Sula municipal boundary, projected into the same city frame. Portions intentionally fall outside the viewBox; use SVG clipping/overflow hidden.
- `attribution: [{ text, url, license, licenseUrl }]`: credit information. Display the OSM attribution in the map corner.

## Geographic positions

`projection` has `type: "mercator-degrees"`, `scale`, `translate: [tx, ty]`, and `geoBounds: [west, south, east, north]`. To place longitude/latitude in that map's viewBox:

```ts
const x = lon * projection.scale + projection.translate[0];
const y = -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
  * 180 / Math.PI * projection.scale + projection.translate[1];
```

The city frame is longitude −88.11 to −87.92, latitude 15.42 to 15.56. It covers the city and adjacent metropolitan streets, rather than all of the large rural municipality.

`camera-corridor-coordinates.json` reuses the camera defaults from `src/components/sentra/corridor-map-data.ts`. That file already describes its business/camera reference positions as verified. The coordinate transform was recovered by fitting matching OSM street vertices to the existing projected street geometry; the measured fit residual is included in the file. Camera bearings and IDs are preserved. These remain reference locations from the previous app, not newly surveyed installation positions. `/api/map` overrides should take precedence. All of the real camera references are near Bulevar Morazán; do not spread their real alerts across the city.

## Sources and licenses

### Countries

Natural Earth, Admin 0 Countries, 1:10m, via the project's upstream repository:

- Data: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson
- Dataset: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/
- License: **public domain**, https://www.naturalearthdata.com/about/terms-of-use/

Small offshore components below 0.0005 square degrees are omitted to keep the navigation maps legible. The mainland and principal Bay Islands are preserved; the data is for navigation/display, not cadastral or legal boundary interpretation.

### Honduras departments

geoBoundaries `HND-ADM1-10453824`, source OpenStreetMap / Wambacher, represented year 2017, build 2023-12-12.

- Metadata: https://www.geoboundaries.org/api/current/gbOpen/HND/ADM1/
- Pinned data: https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/HND/ADM1/geoBoundaries-HND-ADM1_simplified.geojson
- Source license: **ODbL 1.0**, https://www.openstreetmap.org/copyright
- Display credit: **© OpenStreetMap contributors · geoBoundaries**

The English source label “Bay Islands” is localized as “Islas de la Bahía”.

### Cortés municipalities and San Pedro Sula boundary

geoBoundaries `HND-ADM2-27666195`, source ICF (Instituto Nacional de Conservación y Desarrollo Forestal, Áreas Protegidas y Vida Silvestre), Government of Honduras, represented year 2019, build 2023-01-23.

- Metadata: https://www.geoboundaries.org/api/current/gbOpen/HND/ADM2/
- Pinned data: https://github.com/wmgeolab/geoBoundaries/raw/905b0ba/releaseData/gbOpen/HND/ADM2/geoBoundaries-HND-ADM2_simplified.geojson
- Original source as recorded in metadata: https://datos.gob.hn/en/dataset/limites-municipales/resource/0a086bb7-1e3e-4cb0-b7d8-e21a8417dc5f
- License: **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/
- Display credit: **ICF, Gobierno de Honduras · geoBoundaries**

Cortés municipality membership was selected by polygon representative point within the department. The map retains the source municipality geometries; minor differences between the ADM1 and ADM2 dataset boundaries are expected. Lago de Yojoa is a water feature, not a municipality button. Source names containing “Cortes” have their accent restored.

### City streets

OpenStreetMap contributors, delivered by the Private.coffee Overpass service. The API snapshot reports `2026-06-01T08:52:28Z`.

- Endpoint: https://overpass.private.coffee/api/interpreter
- Data/license: **ODbL 1.0**, https://www.openstreetmap.org/copyright
- Full data license: https://opendatacommons.org/licenses/odbl/1-0/
- Display credit: **© OpenStreetMap contributors** with a link to the copyright page.

The derived OSM geometry data is distributed under ODbL 1.0. Keep this map data separable and retain attribution and licensing information. This does not assert a license over Senttra application code or event data.
