// Geographic interpolation and bounded telemetry prediction. No network or renderer dependency.
export function wrapLongitude(value) { return ((value+180)%360+360)%360-180; }
export function sampleMotion(record, now) {
  const m = record?.motion;
  if (!m?.from || !m?.to || !Number.isFinite(m.toTs)) return null;
  const span = Math.max(1, Number(m.toTs) - Number(m.fromTs));
  const tRaw = (now - Number(m.fromTs)) / span;
  const t = Math.max(0, Math.min(1, tRaw));
  const ease = t*t*(3-2*t);
  const lon = Number(m.from.lon) + wrapLongitude(Number(m.to.lon) - Number(m.from.lon)) * ease;
  const lat = Number(m.from.lat) + (Number(m.to.lat) - Number(m.from.lat)) * ease;
  const altitudeM =
    Number(m.from.altitudeM) + (Number(m.to.altitudeM) - Number(m.from.altitudeM)) * ease;
  let result = { lon, lat, altitudeM };
  if (tRaw > 1 && record.velocity && (record.layer === "aircraft" || record.layer === "maritime")) {
    const seconds = Math.min(15, (now - m.toTs) / 1000);
    const bearing = record.velocity.heading * Math.PI / 180;
    const distance = record.velocity.speed * seconds / 6371008.8;
    const phi=lat*Math.PI/180;
    const nextLat=Math.asin(Math.sin(phi)*Math.cos(distance)+Math.cos(phi)*Math.sin(distance)*Math.cos(bearing));
    const nextLon=lon*Math.PI/180+Math.atan2(Math.sin(bearing)*Math.sin(distance)*Math.cos(phi),Math.cos(distance)-Math.sin(phi)*Math.sin(nextLat));
    result = { lon: wrapLongitude(nextLon*180/Math.PI), lat: nextLat*180/Math.PI, altitudeM };
  }
  return result;
}
