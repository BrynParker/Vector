import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
function extract(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);const end=source.indexOf('\nfunction ',start+1);return source.slice(start,end<0?undefined:end);}
test('a full scene refresh updates every layer with only one visibility and chart pass',()=>{
 let charts=0,visibility=0,suspended=0,resumed=0;const layers=[];
 const context={liveSnapshot:{},viewer:{entities:{suspendEvents(){suspended++},resumeEvents(){resumed++}}},applyLayerVisibility(){visibility++},updateKpisAndCharts(){charts++},renderFeedPanels(){},logRenderStats(){},pushDebug(message){throw Error(message)}};
 for(const name of ['Aircraft','Satellites','Seismic','Traffic','Cctv','Maritime','DownDetector','News','WeatherAlerts'])context['update'+name]=()=>layers.push(name);
 vm.createContext(context);vm.runInContext(extract('applyLayerUpdate')+'\n'+extract('applySnapshot')+'\napplySnapshot({});',context);
 console.log(JSON.stringify({chartPasses:charts,visibilityPasses:visibility,entityLayersUpdated:layers.length}));
 assert.equal(layers.length,9,'Every entity layer must still update');
 assert.equal(charts,1,'Avoid repeated chart/layout work during a single scene snapshot');
 assert.equal(visibility,1,'Avoid rescanning every entity for each layer');
 assert.equal(suspended,1);assert.equal(resumed,1);
});
import { sampleCachedMotion, updateStemPositions, oncePerFrame } from '../public/render-performance.js';
import { sampleMotion } from '../public/tactical-motion.js';
import { initRenderBudget } from '../public/render-budget.js';
test('marker samples are reused within a frame and invalidate on new telemetry',()=>{
 const record={layer:'aircraft',motion:{from:{lon:179,lat:20,altitudeM:1000},to:{lon:-179,lat:21,altitudeM:2000},fromTs:0,toTs:1000}};
 const first=sampleCachedMotion(record,500);
 assert.deepEqual(first,sampleMotion(record,500));
 assert.equal(sampleCachedMotion(record,500),first);
 const later=sampleCachedMotion(record,750);assert.equal(later,first);assert.deepEqual(later,sampleMotion(record,750));
 record.motion={...record.motion,to:{lon:-170,lat:25,altitudeM:3000}};
 assert.deepEqual(sampleCachedMotion(record,750),sampleMotion(record,750));
 record.velocity={speed:150,heading:90};assert.deepEqual(sampleCachedMotion(record,1500),sampleMotion(record,1500));
 const stopped=sampleCachedMotion(record,50000);assert.deepEqual(stopped,sampleMotion(record,50000));const stoppedTime=record.frameTime;assert.equal(sampleCachedMotion(record,90000),stopped);assert.equal(record.frameTime,stoppedTime);
 assert.deepEqual(sampleCachedMotion(record,-100),sampleMotion(record,-100));
});
test('moving stems reuse their geographic buffers without losing altitude',()=>{
 class Cartesian3{static fromDegrees(lon,lat,alt,_ellipsoid,out){Object.assign(out,{lon,lat,alt});return out}}
 const engine={Cartesian3,Ellipsoid:{WGS84:{}}},record={};
 const first=updateStemPositions(record,{lon:1,lat:2,altitudeM:300},engine), ground=first[0],tip=first[1];
 const next=updateStemPositions(record,{lon:3,lat:4,altitudeM:600},engine);
 assert.equal(first,next);assert.equal(next[0],ground);assert.equal(next[1],tip);assert.equal(tip.alt,600);assert.equal(ground.alt,0);
});
test('feed bursts refresh charts once and accept the next frame',()=>{
 const frames=[];let count=0;const refresh=oncePerFrame(()=>count++,fn=>frames.push(fn));
 for(let n=0;n<100;n++)refresh();assert.equal(frames.length,1);frames.shift()();assert.equal(count,1);
 refresh();frames.shift()();assert.equal(count,2);
});
test('slow gestures reduce pixel work, restore full quality, and preserve rendering after tab return',()=>{
 const event=()=>({addEventListener(fn){this.fire=fn}});
 let now=0,restore;
 const page={hidden:false,addEventListener(_name,fn){this.visibility=fn}};
 const viewer={resolutionScale:1.5,useDefaultRenderLoop:true,resize(){},camera:{moveStart:event(),moveEnd:event()},scene:{globe:{tileCacheSize:180},postRender:event(),requestRender(){}}};
 initRenderBudget(viewer,{document:page,now:()=>now,navigator:{hardwareConcurrency:4},setTimeout:fn=>{restore=fn},clearTimeout:()=>{}});
 assert.equal(viewer.scene.globe.tileCacheSize,64);viewer.camera.moveStart.fire();assert.equal(viewer.resolutionScale,1);
 for(let n=0;n<40;n++){now+=40;viewer.scene.postRender.fire();}
 assert.ok(viewer.resolutionScale<1);viewer.camera.moveEnd.fire();restore();assert.equal(viewer.resolutionScale,1.5);
 page.hidden=true;page.visibility();assert.equal(viewer.useDefaultRenderLoop,false);
 page.hidden=false;page.visibility();assert.equal(viewer.useDefaultRenderLoop,true);
});
import { sampleOrbitSegment } from '../public/render-performance.js';
test('orbital sampling reuses the next endpoint and supports staggered clocks, replay and TLE refresh',()=>{
 const record={samplePhase:250};const calls=[];const sample=time=>{calls.push(time);return {time}};
 let segment=sampleOrbitSegment(record,1750,sample);assert.equal(segment.a.time,1250);assert.equal(segment.b.time,2250);assert.equal(segment.t,.5);assert.equal(calls.length,2);
 sampleOrbitSegment(record,1800,sample);assert.equal(calls.length,2);
 segment=sampleOrbitSegment(record,2250,sample);assert.equal(segment.a.time,2250);assert.equal(segment.b.time,3250);assert.equal(calls.length,3);
 segment=sampleOrbitSegment(record,1000,sample);assert.equal(segment.a.time,250);assert.equal(segment.b.time,1250);assert.equal(segment.t,.75);
 record.sampleSecond=null;segment=sampleOrbitSegment(record,1750,sample);assert.equal(segment.a.time,1250);assert.equal(calls.length,7,'Changed TLE invalidates both old endpoints');
});
test('stationary markers use constant geometry and still receive updated telemetry',()=>{
 class Cartesian3 { static ZERO={}; static UNIT_Z={}; static fromDegrees(lon,lat,alt,_ellipsoid,result=new Cartesian3()){return Object.assign(result,{lon,lat,alt})} static fromDegreesArrayHeights(values){return values.slice()} }
 class Constant {constructor(value){this.setValue(value)}setValue(value){this.value=structuredClone(value)}getValue(){return this.value}}
 class Callback {constructor(callback){this.callback=callback}getValue(){return this.callback()}}
 const color={withAlpha(){return this},toCssColorString(){return '#abcdef'}};
 const engine={Cartesian3,CallbackProperty:Callback,Ellipsoid:{WGS84:{}},Color:{WHITE:color},VerticalOrigin:{CENTER:0},NearFarScalar:class{},PolylineDashMaterialProperty:class{}};
 const context={Cesium:engine,liveTotals:{},getLayerScale:()=>1,getLayerOpacity:()=>1,removeEntityById(){},markerStyleForLayer:()=>({color,stemAlpha:.4,capScale:.5,altitudeM:100}),seedMotion(record,item){record.motion={from:item,to:item}},updateMotion(record,item){record.motion={from:item,to:item}},registerTacticalMarker(){},buildGlyphSvg:()=>'',headingBetween:()=>0,shouldShowLabels:()=>false,MOTION_BLEND_MS:{aircraft:1000,maritime:1000},getRecordMotionPoint:record=>record.motion.to};
 context.viewer={entities:{add(entity){if(entity.position && !(entity.position instanceof Callback))entity.position=new Constant(entity.position);if(entity.polyline && !(entity.polyline.positions instanceof Callback))entity.polyline.positions=new Constant(entity.polyline.positions);return entity}}};
 vm.createContext(context);vm.runInContext(extract('createLiftedMarkerEntity')+'\n'+extract('setLiftedMarkerPosition'),context);
 const camera=context.createLiftedMarkerEntity('cctv',{id:'camera',lat:1,lon:2},'cctv','');
 assert.ok(camera.cap.position instanceof Constant);assert.ok(camera.stem.polyline.positions instanceof Constant);assert.equal(camera.cap.billboard.rotation,0);
 context.setLiftedMarkerPosition(camera,'cctv',{id:'camera',lat:4,lon:5},'');
 assert.equal(camera.cap.position.getValue().lat,4);assert.deepEqual(camera.stem.polyline.positions.getValue(),[5,4,0,5,4,100]);
 const aircraft=context.createLiftedMarkerEntity('aircraft',{id:'air',lat:1,lon:2,altitudeM:100},'aircraft','');
 assert.ok(aircraft.cap.position instanceof Callback);assert.ok(aircraft.stem.polyline.positions instanceof Callback);assert.equal(aircraft.cap.billboard.rotation,0);
});
