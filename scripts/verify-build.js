import { access, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
for (const file of ['public/index.html','public/app.js','public/styles.css','public/assets/earth-realistic/4/0/0.jpg','public/vendor/satellite.LICENSE.md','package-lock.json']) await access(file);
for (const dir of ['src','public']) for (const file of await readdir(dir)) {
  if (!file.endsWith('.js')) continue;
  const result = spawnSync(process.execPath,['--check',path.join(dir,file)],{stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('[vector] Runtime files and JavaScript syntax verified.');
