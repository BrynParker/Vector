// Keep the full-quality resting image; spend fewer pixels only during slow gestures.
export function initRenderBudget(viewer, environment = {}) {
  const page = environment.document || document;
  const clock = environment.now || (() => performance.now());
  const delay = environment.setTimeout || setTimeout;
  const cancel = environment.clearTimeout || clearTimeout;
  const hardware = environment.navigator || navigator;
  const nativeScale = viewer.resolutionScale;
  const constrained = (hardware.deviceMemory && hardware.deviceMemory <= 4) || (hardware.hardwareConcurrency && hardware.hardwareConcurrency <= 4);
  if (constrained) viewer.scene.globe.tileCacheSize = 64;
  let moving=false, restoring, previous, total=0, count=0, lastAdjustment=0;
  let interactionScale=constrained ? Math.min(nativeScale,1) : nativeScale;
  viewer.camera.moveStart.addEventListener(() => {
    cancel(restoring); moving=true; previous=undefined; total=0; count=0;
    viewer.resolutionScale=interactionScale;
  });
  viewer.camera.moveEnd.addEventListener(() => {
    moving=false;
    restoring=delay(() => { viewer.resolutionScale=nativeScale; viewer.scene.requestRender(); },200);
  });
  viewer.scene.postRender.addEventListener(() => {
    if (!moving || page.hidden) return;
    const now=clock();
    const interval=previous === undefined ? 0 : now-previous;
    previous=now;
    if (interval>0 && interval<200) {total+=interval; count++;}
    if (count<20 || now-lastAdjustment<1000) return;
    const mean=total/count;
    if (mean>28) viewer.resolutionScale=Math.max(.65,Math.min(nativeScale,viewer.resolutionScale*.85));
    else if (mean<19 && viewer.resolutionScale<nativeScale) viewer.resolutionScale=Math.min(nativeScale,viewer.resolutionScale+.1);
    interactionScale=viewer.resolutionScale;
    total=0;count=0;lastAdjustment=now;
  });
  let wasRunning;
  page.addEventListener('visibilitychange', () => {
    if (page.hidden) { wasRunning=viewer.useDefaultRenderLoop; viewer.useDefaultRenderLoop=false; }
    else if (wasRunning) { viewer.useDefaultRenderLoop=true; previous=undefined; viewer.resize(); viewer.scene.requestRender(); }
  });
}
