import { createHmac, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

// Personal locations never enter shared broadcasts, analytics, or the public replay buffer.
export class VisitorStore {
  constructor(secret, { ttlMs = 86400000, maxVisitors = 10000 } = {}) {
    this.key = createHash('sha256').update(secret).digest();
    this.ttlMs = ttlMs; this.maxVisitors = maxVisitors; this.visitors = new Map();
  }
  sign(id) { return createHmac('sha256', this.key).update(id).digest('base64url'); }
  fromRequest(req) {
    const value = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('vector_session='))?.slice(15);
    if (!value) return null;
    const [id, signature] = value.split('.');
    if (!/^[a-f0-9]{48}$/.test(id || '') || !signature) return null;
    const expected = Buffer.from(this.sign(id)), supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const state = this.visitors.get(id);
    if (!state || state.expires < Date.now()) { this.visitors.delete(id); return null; }
    state.expires = Date.now()+this.ttlMs;
    return state;
  }
  middleware() {
    return (req, res, next) => {
      let state = this.fromRequest(req);
      if (!state) {
        for (const [id, item] of this.visitors) if (item.expires < Date.now()) this.visitors.delete(id);
        if (this.visitors.size >= this.maxVisitors) return res.status(503).json({ error: 'Please retry later.' });
        const id = randomBytes(24).toString('hex');
        state = { id, marker: null, location: null, expires: Date.now()+this.ttlMs };
        this.visitors.set(id, state);
        res.cookie('vector_session', `${id}.${this.sign(id)}`, { httpOnly: true, secure: req.secure, sameSite: 'lax', maxAge: this.ttlMs, path: '/' });
      }
      req.visitor = state; next();
    };
  }
  encryptedSnapshot() {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const rows = [...this.visitors.values()].filter(s => s.expires > Date.now() && (s.marker || s.location));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(rows), 'utf8'), cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
  }
  restore(token) {
    if (!token) return;
    try {
      const data = Buffer.from(token,'base64');
      const decipher = createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));
      decipher.setAuthTag(data.subarray(12,28));
      const rows = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
      for (const row of rows.slice(0,this.maxVisitors)) if (/^[a-f0-9]{48}$/.test(row.id) && row.expires > Date.now()) this.visitors.set(row.id,row);
    } catch { /* A missing or rotated key cannot decrypt older private sessions. */ }
  }
}
