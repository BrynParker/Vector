import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { publicUrlTarget, isPublicAddress } from '../src/safe-url.js';
import { VisitorStore } from '../src/visitor-state.js';

test('URL lookups reject private, reserved, mixed DNS and non-web targets', async () => {
  for (const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','fc00::1','::ffff:127.0.0.1','0.0.0.0','224.0.0.1']) assert.equal(isPublicAddress(address),false,address);
  assert.equal(isPublicAddress('8.8.8.8'),true);
  for (const url of ['file:///etc/passwd','http://localhost','http://2130706433','http://[::1]','https://user:pass@example.com','https://example.com:8443']) await assert.rejects(publicUrlTarget(url));
  await assert.rejects(publicUrlTarget('https://example.com',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]));
  assert.equal((await publicUrlTarget('https://example.com',async()=>[{address:'8.8.8.8',family:4}])).addresses.length,1);
});
test('private session snapshots are authenticated and encrypted', () => {
  const store=new VisitorStore('test-only-'.repeat(8));
  const state={id:'a'.repeat(48),location:{lat:12.345678,lon:45.678912},marker:null,expires:Date.now()+60000};
  store.visitors.set(state.id,state);
  const token=store.encryptedSnapshot();
  assert.ok(!token.includes('12.345678'));
  const restored=new VisitorStore('test-only-'.repeat(8));restored.restore(token);
  assert.deepEqual(restored.visitors.get(state.id),state);
  const wrong=new VisitorStore('different-test-value');wrong.restore(token);assert.equal(wrong.visitors.size,0);
  assert.equal(store.fromRequest({headers:{cookie:`vector_session=${state.id}.forged`}}),null);
});
test('HTTP and WebSocket security preserve isolated visitor state', {timeout:30000}, async t => {
  const directory=await mkdtemp(path.join(tmpdir(),'vector-test-'));
  const env={...process.env,NODE_ENV:'test',ENV_FILE:path.join(directory,'absent.env'),APP_HOST:'127.0.0.1',SERVER_PORT:'0',JWT_SECRET:'',DATA_CACHE_PATH:path.join(directory,'cache.json'),TRUST_PROXY:'loopback',PUBLIC_ORIGIN:'',ENABLE_SATELLITES:'false',ENABLE_TRAFFIC:'false',ENABLE_OPENSKY:'false',ENABLE_ADSB:'false'};
  const entry=path.resolve('src/server.js');
  const child=spawn(process.execPath,[entry],{cwd:directory,env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await rm(directory,{recursive:true,force:true});});
  // The application logs the allocated port (including port=0 in tests).
  let base;
  for(let n=0;n<100;n++){
    const match=output.match(/running on http:\/\/127\.0\.0\.1:(\d+)/);
    if(match){base=`http://127.0.0.1:${match[1]}`;break;}
    if(child.exitCode!==null) throw new Error(output);
    await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(base,'Server started');
  const health=await fetch(base+'/healthz');assert.equal(health.status,200);
  assert.equal(health.headers.get('x-powered-by'),null);
  assert.equal(health.headers.get('x-content-type-options'),'nosniff');
  assert.equal(health.headers.get('x-frame-options'),'DENY');
  assert.ok(health.headers.get('content-security-policy').includes("object-src 'none'"));
  assert.equal((await fetch(base+'/readyz')).status,200,'No optional keys required to boot');
  for(const file of ['/.env.production','/package.json','/data/.session-key','/src/server.js','/logs/vector-runtime.log']) assert.equal((await fetch(base+file)).status,404);
  assert.equal((await fetch(base+'/app.js')).status,200);
  const bootA=await fetch(base+'/api/config'), bootB=await fetch(base+'/api/config');
  const cookieA=bootA.headers.get('set-cookie').split(';')[0], cookieB=bootB.headers.get('set-cookie').split(';')[0];
  assert.notEqual(cookieA,cookieB);assert.ok(bootA.headers.get('set-cookie').includes('HttpOnly'));
  const json=async(route,method='GET',body,cookie=cookieA,extra={})=>fetch(base+route,{method,headers:{cookie,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal((await json('/api/marker','POST',{lat:1,lon:2},cookieA,{origin:'https://attacker.example'})).status,403);
  assert.equal((await json('/api/marker','POST',{lat:91,lon:0})).status,400);
  const sockets=[];t.after(()=>sockets.forEach(ws=>ws.terminate()));
  const connect=async cookie=>{
    const ws=new WebSocket(base.replace('http:','ws:')+'/ws',{headers:{cookie,origin:base}});sockets.push(ws);
    const message=once(ws,'message');await once(ws,'open');return {ws,snapshot:JSON.parse((await message)[0])};
  };
  const a=await connect(cookieA),b=await connect(cookieB);const bMessages=[];b.ws.on('message',data=>bMessages.push(JSON.parse(data)));
  const location={lat:12.345678,lon:45.678912,accuracyM:12};
  assert.equal((await json('/api/location','POST',location)).status,200);
  assert.equal((await (await json('/api/location')).json()).location.lat,location.lat);
  assert.equal((await (await json('/api/location','GET',undefined,cookieB)).json()).location,null);
  assert.equal((await (await json('/api/marker','GET',undefined,cookieB)).json()).marker,null);
  assert.equal((await (await json('/api/config','GET',undefined,cookieB)).json()).scene.marker,null);
  const another=await connect(cookieB);assert.equal(another.snapshot.payload.userLocation,null);
  const replay=await (await json('/api/replay')).json();assert.ok(!JSON.stringify(replay).includes('12.345678'));
  await new Promise(r=>setTimeout(r,500));assert.ok(!JSON.stringify(bMessages).includes('12.345678'));
  const cache=await readFile(path.join(directory,'cache.json'),'utf8');assert.ok(!cache.includes('12.345678'));assert.ok(JSON.parse(cache).encryptedVisitorSessions);
  assert.equal((await json('/api/osint/lookup','POST',{type:'url_metadata',url:'http://169.254.169.254/latest/meta-data/'})).status,400);
  assert.equal((await fetch(base+'/api/marker',{method:'POST',headers:{cookie:cookieA,'content-type':'application/json'},body:'{'})).status,400);
  assert.equal((await json('/api/location','DELETE')).status,200);
  assert.equal((await (await json('/api/marker')).json()).marker,null);
  const forbidden=new WebSocket(base.replace('http:','ws:')+'/ws',{headers:{cookie:cookieA,origin:'https://attacker.example'}});
  const [error]=await once(forbidden,'error');assert.match(error.message,/403/);
  for(let n=0;n<27;n++) await json('/api/marker','POST',{lat:1,lon:2});
  assert.equal((await json('/api/marker','POST',{lat:1,lon:2})).status,429);
});
