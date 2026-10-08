# Vector visual assets

- `public/assets/icons.svg`: project-native SVG symbol set, drawn to match the supplied reference.
- `public/vector-mark.svg`: refined angular Vector mark.
- `public/assets/satellite-orbit.png`: generated illustrative artwork. Illustrative spacecraft image, not a photograph of the selected tracked object.
- `public/assets/earth-night.jpg`: NASA Earth Observatory, Black Marble 2016 color composite (3600 × 1800). https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/ . Historical basemap imagery, not live night-light measurements.

- `public/assets/earth-clouds.jpg`: NASA Blue Marble cloud composite, Reto Stöckli. https://visibleearth.nasa.gov/images/57747/blue-marble-clouds/77558l . Static decorative cloud imagery, not live weather.
- `public/assets/starfield.svg` and `starfield.png`: original vector starfield; PNG rasterized with resvg from the SVG for Cesium cubemap compatibility.

## HD globe

- `public/assets/earth-hd/{z}/{x}/{y}.jpg`: 170 local 512px geographic tiles, with an 8192 × 4096 full-world resolution. Derived using geographic NASA imagery, a blue cartographic grade, isolated warm city lights, and a thin static cloud composite.
- Day source: NASA Blue Marble Next Generation, July 2004, topography/bathymetry, 21600 × 10800. https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x21600x10800.jpg . Source overview: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/
- Night source: NASA Black Marble 2016, 13500 × 6750. https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg
- Original high-resolution source composites are available from the NASA links above; development source downloads are not bundled. These are historical geographic composites, not live weather or current measurements of city lighting.
- `public/globe-appearance.js`: original GPU shader for camera-relative lighting, blue surface scattering, and a WGS84 ellipsoid-derived atmospheric halo. The effect follows zoom and rotation and is bypassed in 2D.


## Tactical Tracks globe (2026-10-08)

- `public/assets/earth-realistic/`: 682 geographic JPEG tiles, 512 px each, levels 0–4; 16,384 × 8,192 maximum global resolution. Derived from the NASA Blue Marble July 2004, Black Marble 2016 and static cloud sources above. Historical composites, not live cloud/weather measurements.
- `public/assets/earth-land-mask.png`: 8K land/ocean classification derived from the same NASA day image. Globe-native procedural dots and geographic grid are defined in `public/globe-appearance.js`. Dots refine with zoom; close-range surface detail blends through.
- Close-range imagery is streamed directly by Cesium's ArcGIS imagery provider from https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer . Attribution is supplied by the provider and retained in Cesium's credit display: Esri, Vantor, Earthstar Geographics, and the GIS User Community. Network access is required for this additional detail; the local NASA tiles remain available as fallback. Coverage/resolution varies geographically.
- `public/tactical-markers.js`: original code-native SVG artwork for all operational layers and catalog symbols, with separate selected/stale states. No third-party icon artwork or raster mockup is embedded as the globe.
- `public/vendor/satellite.es.js`: satellite.js 5.x browser ES module copied from the project's installed dependency. MIT license preserved in `public/vendor/satellite.LICENSE.md`.
