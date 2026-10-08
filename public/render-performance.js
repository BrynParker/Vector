import { sampleMotion } from './tactical-motion.js';

// One geographic sample per entity per scene tick, shared by stems, caps and trails.
export function sampleCachedMotion(record, now) {
  const motion = record.motion;
  // Once bounded prediction stops, later frames have exactly the same position.
  if (Number.isFinite(motion?.fromTs) && Number.isFinite(motion?.toTs)) {
    const prediction = record.velocity && (record.layer === 'aircraft' || record.layer === 'maritime') ? 15000 : 0;
    now = Math.max(motion.fromTs, Math.min(now, motion.toTs + prediction));
  }
  if (record.frameTime !== now || record.frameMotion !== record.motion || record.frameVelocity !== record.velocity) {
    record.framePoint = sampleMotion(record, now, record.framePoint || {});
    record.frameTime = now;
    record.frameMotion = record.motion;
    record.frameVelocity = record.velocity;
  }
  return record.framePoint;
}

export function updateStemPositions(record, point, engine) {
  const positions = record.stemPositions ||= [new engine.Cartesian3(), new engine.Cartesian3()];
  engine.Cartesian3.fromDegrees(point.lon, point.lat, 0, engine.Ellipsoid.WGS84, positions[0]);
  engine.Cartesian3.fromDegrees(point.lon, point.lat, point.altitudeM, engine.Ellipsoid.WGS84, positions[1]);
  return positions;
}

export function oncePerFrame(callback, schedule = requestAnimationFrame) {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    schedule(() => { pending = false; callback(); });
  };
}

// Stagger orbital calculations and reuse the previous endpoint on each next second.
export function sampleOrbitSegment(record, clock, sample) {
  const phase = record.samplePhase || 0;
  const second = Math.floor((clock - phase) / 1000);
  if (record.sampleSecond !== second) {
    const nextA = Number.isInteger(record.sampleSecond) && second === record.sampleSecond + 1 && record.sampleB ? record.sampleB : sample(second * 1000 + phase);
    record.sampleA = nextA;
    record.sampleB = sample((second + 1) * 1000 + phase);
    record.sampleSecond = second;
  }
  const segment = record.orbitSegment ||= {};
  segment.a = record.sampleA; segment.b = record.sampleB;
  segment.t = (clock - (second * 1000 + phase)) / 1000;
  return segment;
}
