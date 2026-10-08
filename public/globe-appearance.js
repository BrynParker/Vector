// Camera-relative studio lighting for Vector's real, interactive 3D globe.
// The halo is derived from the Earth ellipsoid, so it follows rotation and zoom.
export function initGlobeAppearance(viewer) {
  const scene = viewer.scene;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
  scene.globe.maximumScreenSpaceError = 1.25;
  scene.globe.tileCacheSize = 180;
  scene.globe.enableLighting = false; // Stable presentation, independent of UTC.
  scene.globe.showGroundAtmosphere = false;
  scene.skyAtmosphere.show = false; // One coherent atmosphere, rendered below.
  scene.postProcessStages.fxaa.enabled = true;
  const stage = scene.postProcessStages.add(new Cesium.PostProcessStage({
    name: 'vector-earth-lighting',
    uniforms: { enabledGlobe: () => scene.mode === Cesium.SceneMode.SCENE3D && scene.globe.show },
    fragmentShader: `
      uniform sampler2D colorTexture;
      uniform sampler2D depthTexture;
      uniform bool enabledGlobe;
      in vec2 v_textureCoordinates;
      const vec3 radii = vec3(6378137.0, 6378137.0, 6356752.314245);
      void main() {
        vec4 color = texture(colorTexture, v_textureCoordinates);
        if (!enabledGlobe) { out_FragColor = color; return; }
        float depth = czm_unpackDepth(texture(depthTexture, v_textureCoordinates));
        vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        eye /= eye.w;
        vec3 world = (czm_inverseView * vec4(eye.xyz, 1.0)).xyz;
        float height = (length(world / radii) - 1.0) * 6378137.0;
        vec3 key = normalize(vec3(-0.28, 0.82, 0.56));
        if (depth > 0.0 && depth < 1.0 && abs(height) < 7000.0) {
          vec3 normal = normalize(world / (radii * radii));
          vec3 normalEC = normalize(czm_viewRotation * normal);
          float light = max(dot(normalEC, key), 0.0);
          float facing = max(dot(normalEC, normalize(-eye.xyz)), 0.0);
          float rim = pow(1.0 - facing, 3.2);
          color.rgb *= 0.64 + 0.70 * light;
          color.rgb += vec3(0.025, 0.20, 0.34) * rim * (0.40 + light);
        }
        // Evaluate the closest point of each view ray to the WGS84 ellipsoid.
        vec4 farPoint = czm_inverseProjection * vec4(v_textureCoordinates*2.0-1.0, 0.0, 1.0);
        vec3 rayEC = normalize(farPoint.xyz / farPoint.w);
        vec3 origin = czm_viewerPositionWC / radii;
        vec3 direction = (czm_inverseViewRotation * rayEC) / radii;
        float t = -dot(origin, direction) / dot(direction, direction);
        vec3 closest = origin + direction * t;
        float gap = (length(closest) - 1.0) * 6378137.0;
        if (gap > 0.0 && gap < 420000.0 && t > 0.0) {
          vec3 normalEC = normalize(czm_viewRotation * normalize(closest));
          float keyLight = 0.35 + 0.65 * max(dot(normalEC, key), 0.0);
          float halo = exp(-gap / 110000.0) * 0.46 + exp(-gap / 21000.0) * 0.78;
          color.rgb += vec3(0.13, 0.65, 1.0) * halo * keyLight;
        }
        out_FragColor = color;
      }
    `
  }));
  const visibilityMaterial = new Cesium.Material({fabric:{
    type:'VectorVisibility',
    uniforms:{landMask:'/assets/earth-land-mask.png',cameraHeight:14500000.0},
    source:`czm_material czm_getMaterial(czm_materialInput inputData) {
      czm_material material=czm_getDefaultMaterial(inputData);
      vec3 worldPosition=(czm_inverseView*vec4(-inputData.positionToEyeEC,1.)).xyz;
      vec3 worldNormal=normalize(worldPosition/vec3(40680631590769.,40680631590769.,40408299984661.));
      vec2 uv=vec2(atan(worldNormal.y,worldNormal.x)/6.28318530718+.5,asin(worldNormal.z)/3.14159265359+.5);
      float land=texture(landMask,uv).r;
      float cells=exp2(floor(log2(clamp(4000000000.0/max(cameraHeight,1000.0),128.0,32768.0))));
      vec2 grid=uv*vec2(cells*2.0,cells);
      float aa=min(.06,max(fwidth(grid.x),fwidth(grid.y))*.5);
      float dots=1.-smoothstep(.16-aa,.16+aa,length(fract(grid)-.5));
      vec2 lineUV=uv*vec2(36.,18.);
      vec2 lines=abs(fract(lineUV-.5)-.5)/max(fwidth(lineUV),vec2(.00001));
      vec3 surface=mix(vec3(.004,.011,.020),vec3(.012,.028,.045),land);
      surface+=land*dots*vec3(.65,.83,.96);
      surface+=vec3(.015,.04,.055)*(1.-min(min(lines.x,lines.y),1.));
      material.diffuse=surface;material.emission=surface*.2;
      material.alpha=.98-(1.-smoothstep(80000.,1200000.,cameraHeight))*.40;
      return material;
    }`
  }});
  let visibility=false;
  scene.preRender.addEventListener(()=>{
    visibilityMaterial.uniforms.cameraHeight=viewer.camera.positionCartographic.height;
    const material=visibility && scene.mode===Cesium.SceneMode.SCENE3D?visibilityMaterial:undefined;
    if(scene.globe.material!==material) scene.globe.material=material;
  });
  return {
    set visibilityMode(value){visibility=Boolean(value);},
    stage
  };
}
