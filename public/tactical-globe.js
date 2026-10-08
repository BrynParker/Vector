// Globe-only controls and progressively streamed close-range imagery.
export function initTacticalGlobe(viewer, setMode) {
 const host = document.getElementById('cesiumContainer');
 const controls = document.createElement('div');
 controls.className = 'vector-earth-switch';
 controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Earth appearance');
 controls.innerHTML = '<button type="button" data-earth="real" aria-pressed="true">Realistic</button><button type="button" data-earth="flat" aria-pressed="false">Visibility</button>';
 host.appendChild(controls);
 const css = document.createElement('style');
 css.textContent = '.vector-earth-switch{position:absolute;z-index:4;top:12px;left:50%;transform:translateX(-50%);display:flex;padding:3px;gap:3px;border:1px solid #66cdec40;border-radius:6px;background:#06131fd9;backdrop-filter:blur(14px)}.vector-earth-switch button{font:11px system-ui;color:#a6becd;background:transparent;border:1px solid transparent;border-radius:4px;padding:7px 13px;cursor:pointer}.vector-earth-switch button[aria-pressed="true"]{color:#e4faff;background:linear-gradient(135deg,#2c647a88,#15344988);border-color:#69dafa77}.vector-earth-switch button:focus-visible{outline:2px solid #8af4ff;outline-offset:2px}';
 document.head.appendChild(css);
 controls.addEventListener('click', event => { const button=event.target.closest('[data-earth]'); if(button) setMode(button.dataset.earth); });
 let detail, previousFrame=0, frameTotal=0, frameCount=0, reportAt=0;
 Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer').then(provider => {
   detail = viewer.imageryLayers.addImageryProvider(provider);
   detail.show = false; detail.brightness = .88; detail.saturation = .8;
 }).catch(error => console.warn('Close-range imagery unavailable; retaining local NASA imagery.', error.message));
 viewer.scene.preRender.addEventListener(() => {
   if (!detail) return;
   const height = viewer.camera.positionCartographic.height;
   detail.show = viewer.scene.globe.show && height < 3500000;
   detail.alpha = Math.max(0, Math.min(1, (3500000-height)/1800000));
   host.dataset.closeImagery=detail.show?'streamed':'local';
   host.dataset.cameraHeight=String(Math.round(height));
   const now=performance.now();
   if(previousFrame && now-previousFrame<250){frameTotal+=now-previousFrame;frameCount++;}
   previousFrame=now;
   if(now-reportAt>2000){host.dataset.meanFrameMs=String(Math.round(frameTotal/Math.max(1,frameCount)));frameTotal=0;frameCount=0;reportAt=now;}
 });
 return mode => {
   host.dataset.earthMode = mode;
   for(const button of controls.children) button.setAttribute('aria-pressed', String(button.dataset.earth===mode));
 };
}
