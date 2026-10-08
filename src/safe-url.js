import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch { return false; }
}

export async function publicUrlTarget(input, resolve = lookup) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public HTTP or HTTPS URL without credentials.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard web ports are supported.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Private network URLs are not allowed.');
  const addresses = ipaddr.isValid(hostname) ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }] : await Promise.race([resolve(hostname, { all: true }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('DNS lookup timed out.')), 5000); timer.unref(); })]);
  if (!addresses.length || addresses.some(row => !isPublicAddress(row.address))) throw new Error('Private and reserved network addresses are not allowed.');
  return { url, addresses };
}

// Pin the validated address in the socket lookup; revalidate every redirect.
export async function fetchPublicMetadata(input, remaining = 3) {
  if (String(input).length > 4096) throw new Error('URL is too long.');
  const { url, addresses } = await publicUrlTarget(input);
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, {
      headers: { 'User-Agent': 'Vector/1.0', Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
      lookup: (_host, options, callback) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family)
    }, response => {
      if ([301,302,303,307,308].includes(response.statusCode) && response.headers.location) {
        response.destroy();
        if (!remaining) { reject(new Error('Too many redirects.')); return; }
        fetchPublicMetadata(new URL(response.headers.location,url).toString(),remaining-1).then(resolve,reject); return;
      }
      const chunks = []; let length = 0;
      const finish = () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const title = body.match(/<title[^>]*>([^<]+)<\/title>/i);
        resolve({ url: String(input), finalUrl: url.toString(), status: response.statusCode, statusText: response.statusMessage, contentType: response.headers['content-type'] || '', server: response.headers.server || '', title: title?.[1]?.trim() || '' });
      };
      response.on('data', chunk => {
        length += chunk.length;
        if (length > 512*1024) { finish(); response.destroy(); return; }
        chunks.push(chunk);
      });
      response.once('end', finish); response.once('error', reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error('URL lookup timed out.')), 15000);
    request.once('close', () => clearTimeout(deadline));
    request.setTimeout(15000, () => request.destroy(new Error('URL lookup timed out.')));
    request.once('error', () => reject(new Error('Unable to retrieve that public URL.')));
  });
}
