const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';
const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

export async function fetchOpenSky(limit = 500) {
  const res = await fetch(OPEN_SKY_URL, { headers: { 'User-Agent': 'WorldViewDupe/0.1' } });
  if (!res.ok) throw new Error(`OpenSky error: ${res.status}`);
  const json = await res.json();
  const rows = (json.states || []).slice(0, limit);

  return rows
    .filter((r) => r[5] != null && r[6] != null)
    .map((r) => ({
      id: `opensky:${r[0]}`,
      source: 'opensky',
      kind: 'aircraft',
      ts: new Date((r[4] || json.time || Date.now() / 1000) * 1000).toISOString(),
      position: { lon: r[5], lat: r[6], alt_m: r[7] || 0 },
      velocity: { speed_mps: r[9] || 0, heading_deg: r[10] || 0, vz: r[11] || 0 },
      meta: { callsign: (r[1] || '').trim(), origin_country: r[2], on_ground: r[8] || false },
    }));
}

function parseTLE(text, limit = 180) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const sats = [];
  for (let i = 0; i < lines.length - 2 && sats.length < limit; i += 3) {
    const name = lines[i];
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!l1?.startsWith('1 ') || !l2?.startsWith('2 ')) continue;
    sats.push({ name, line1: l1, line2: l2 });
  }
  return sats;
}

export async function fetchCelestrak(limit = 180) {
  const res = await fetch(CELESTRAK_URL, { headers: { 'User-Agent': 'WorldViewDupe/0.1' } });
  if (!res.ok) throw new Error(`CelesTrak error: ${res.status}`);
  const tleText = await res.text();
  return parseTLE(tleText, limit).map((s, idx) => ({
    id: `celestrak:${idx}:${s.name}`,
    source: 'celestrak',
    kind: 'satellite',
    ts: new Date().toISOString(),
    tle: s,
  }));
}
