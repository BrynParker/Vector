import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { sampleMotion } from '../public/tactical-motion.js';
import { sampleCachedMotion } from '../public/render-performance.js';
const records=Array.from({length:2000},(_,i)=>({layer:'aircraft',velocity:{speed:250,heading:90},motion:{from:{lon:-100+i*.01,lat:30,altitudeM:10000},to:{lon:-99+i*.01,lat:31,altitudeM:11000},fromTs:0,toTs:1000}}));
function run(sample){let checksum=0;const start=performance.now();for(let frame=0;frame<120;frame++){const time=2000+frame*16;for(const record of records)for(let consumer=0;consumer<3;consumer++)checksum+=sample(record,time).lon;}return {milliseconds:performance.now()-start,checksum};}
run(sampleMotion);run(sampleCachedMotion);
const before=Array.from({length:5},()=>run(sampleMotion)),after=Array.from({length:5},()=>run(sampleCachedMotion));
assert.ok(Math.abs(before[0].checksum-after[0].checksum)<1e-6,'Cached positions must preserve all interpolated values');
const median=list=>list.map(r=>r.milliseconds).sort((a,b)=>a-b)[2];
console.log(JSON.stringify({scenario:'2,000 moving markers, 120 frames, three position consumers',uncachedMedianMs:+median(before).toFixed(2),cachedMedianMs:+median(after).toFixed(2),samplingCallsBefore:720000,samplingCallsAfter:240000,positionsMatch:true},null,2));
