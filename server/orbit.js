// Lightweight approximation (not full SGP4): enough to visualize live motion until SGP4 is added.
export function approximateOrbitFromTle(tle, now = Date.now()) {
  const seed = [...tle.name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const phase = ((now / 1000) * 0.001 + seed * 0.017) % (Math.PI * 2);
  const inc = ((seed % 90) + 10) * (Math.PI / 180);

  const lon = ((phase * 180 / Math.PI) * 8) % 360 - 180;
  const lat = Math.sin(phase) * Math.sin(inc) * 75;
  const alt = 420000 + (seed % 200) * 1500;

  return { lon, lat, alt_m: alt };
}
