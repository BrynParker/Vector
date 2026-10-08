import assert from 'node:assert/strict';
import { sampleMotion } from '../public/tactical-motion.js';
import { headingBetween, tacticalGlyph } from '../public/tactical-markers.js';
import * as satellite from '../public/vendor/satellite.es.js';

const record={layer:'aircraft',motion:{from:{lon:179,lat:20,altitudeM:10000},to:{lon:-179,lat:20,altitudeM:11000},fromTs:1000,toTs:2000}};
assert.equal(sampleMotion(record,1500).lon,180,'Dateline crossing must take the short route');
assert.equal(sampleMotion(record,1500).altitudeM,10500);
assert.equal(sampleMotion(record,0).lon,179,'Before interval remains at first observation');
assert.equal(sampleMotion(record,90000).lat,20,'No invented movement without velocity');
record.velocity={speed:250,heading:90};
assert.deepEqual(sampleMotion(record,20000),sampleMotion(record,90000),'Prediction must stop after 15 seconds');
assert.ok(Math.abs(headingBetween({lon:179,lat:0},{lon:-179,lat:0})-Math.PI/2)<1e-9);
assert.equal(sampleMotion({},1000),null);
const polar={...record,motion:{...record.motion,from:{lon:0,lat:89.999,altitudeM:1000},to:{lon:0,lat:89.999,altitudeM:1000}},velocity:{speed:250,heading:0}};
const north=sampleMotion(polar,90000);
assert.ok(Number.isFinite(north.lon)&&Math.abs(north.lat)<=90,'Prediction across a pole must remain a valid geographic position');
assert.deepEqual(sampleMotion(record,1500),sampleMotion(record,1500),'A paused or replay clock yields a stable position');
assert.notEqual(tacticalGlyph('S'),tacticalGlyph('S','#a8dcf3',true),'Selection has its own original SVG');
assert.notEqual(tacticalGlyph('S'),tacticalGlyph('S','#a8dcf3',false,true),'Stale state is visibly distinct');
// Published ISS TLE: verify real propagation advances, rather than an arbitrary path phase.
const sat=satellite.twoline2satrec('1 25544U 98067A   21275.51834491  .00001490  00000-0  33205-4 0  9993','2 25544  51.6445 208.4280 0004205  54.0969  49.0685 15.48815329302745');
const one=satellite.propagate(sat,new Date('2021-10-02T12:30:00Z')).position;
const two=satellite.propagate(sat,new Date('2021-10-02T12:30:01Z')).position;
const distance=Math.hypot(one.x-two.x,one.y-two.y,one.z-two.z);
assert.ok(distance>6&&distance<9,'ISS displacement should be physically plausible over one second');
const start=performance.now();for(let i=0;i<100000;i++)sampleMotion(record,1000+i%90000);
console.log(`Motion, dateline, bounded prediction, marker states and satellite propagation passed. 100,000 interpolation calls: ${(performance.now()-start).toFixed(1)} ms.`);
