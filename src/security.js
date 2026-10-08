import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

export function allowedOrigin(req, origin, publicOrigin = '') {
  if (!origin || origin === 'null') return false;
  try {
    const expected = publicOrigin || `${req.protocol}://${req.get('host')}`;
    return new URL(origin).origin === new URL(expected).origin;
  } catch { return false; }
}

export function installSecurity(app, { publicOrigin = '', trustProxy = 'loopback' } = {}) {
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy === 'false' ? false : trustProxy.split(',').map(s => s.trim()));
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'https://cesium.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cesium.com', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cesium.com', 'data:'],
      imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
      connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
      workerSrc: ["'self'", 'blob:', 'https://cesium.com'],
      mediaSrc: ["'self'", 'https:', 'blob:'],
      frameSrc: ['https:'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null
    } },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    strictTransportSecurity: false
  }));
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && !allowedOrigin(req, origin, publicOrigin))) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(['/api/osint/lookup', '/api/overpass/query'], rateLimit({ windowMs: 15*60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(['/api/osint/lookup', '/api/overpass/query'], rateLimit({ windowMs: 60000, limit: 90, keyGenerator: () => 'upstream-budget', standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(['/api/marker', '/api/location'], rateLimit({ windowMs: 60000, limit: 30, skip: req => req.method === 'GET', standardHeaders: 'draft-8', legacyHeaders: false }));
}

export async function boundedResponseText(response, limit = 8*1024*1024) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Upstream response is too large.');
  if (!response.body) return '';
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('Upstream response is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
