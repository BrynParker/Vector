# Security

## Implemented protections

- CSP limits script origins and blocks inline event handlers, object embeds, and framing. WebAssembly compilation is allowed for Cesium; JavaScript eval is not. Inline styles remain allowed for Cesium and the current UI. HTTPS third-party imagery, media, tiles, and cameras remain supported.
- Helmet headers include MIME sniffing prevention, frame denial, referrer controls, and permissions restrictions. HSTS is issued on HTTPS requests; TLS terminates at a trusted proxy.
- API and expensive upstream calls are rate-limited. JSON size, response size, request duration, WebSocket message size, and slow-client buffering are bounded.
- Same-origin checks protect mutations and WebSocket upgrades. Session cookies are signed, HttpOnly, SameSite=Lax, and Secure over HTTPS.
- Personal location and analysis markers belong to a visitor session, are encrypted at rest using AES-256-GCM, and are excluded from public broadcasts and replay. No shared browser location is restored from older caches.
- URL metadata lookup accepts public HTTP/HTTPS on standard ports only, rejects credentials/private/reserved addresses, pins validated DNS addresses, and revalidates redirects.
- Static hosting is limited to `public/`. Runtime secrets are generated per installation when not explicitly configured. Production environment files, cache, and logs are never part of public releases.
- Logs redact configured credentials and bound client input. Client logging is opt-in. Dependencies are locked and can be checked with `npm audit --omit=dev`.

## Operator requirements and limits

Use a maintained Node.js LTS patch version, HTTPS, accurate `PUBLIC_ORIGIN` and `TRUST_PROXY`, a persistent private data directory, and a firewall limiting direct upstream access. Do not set trust proxy to a blanket network. Never run the application as root. Keep Panel, Wings, Nginx, container images, and dependencies patched.

This application is intended for public read access. There is no operator login, role system, billing/quota isolation, or WAF. Anyone able to reach the API can consume configured OSINT provider quotas within shared limits. For restricted or expensive deployments, place authentication and per-user quotas at the gateway, or disable those provider keys. In-process limits apply per server instance; use a shared gateway limit if scaling replicas.

Browser-visible Google/Cesium credentials must use domain restrictions and minimal scopes. Server-only keys stay on the backend. External services receive lookup inputs and ordinary request metadata; browser imagery and camera providers receive browser requests. Review provider terms and access policies before enabling integrations. Road/feed coverage and imagery are external data, not proof of a person's location or current conditions.

Session cookies represent visitor identity, not an authenticated human account. Shared browsers share one session. Do not publish persistent data or logs. Encrypted data still requires private storage and backups. An earlier deployment's shared or unencrypted location cache is not safe to publish; this release excludes it.

A clean scanner/audit result is a point-in-time check, not a guarantee against future vulnerabilities. Run tests and scans before subsequent releases. If any credential has ever been public, revoke/rotate it; removing it from the latest files does not revoke it or erase copies.

## Reporting

Report security issues privately to the repository owner. Do not post working credentials, precise location records, or exploit payloads containing private data in public issues.
