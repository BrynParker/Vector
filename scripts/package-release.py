#!/usr/bin/env python3
"""Build a credential-free Pterodactyl ZIP from an explicit publication allowlist."""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = ['package.json', 'package-lock.json', 'README.md', 'SECURITY.md', '.env.example', '.env.production.template', '.gitattributes', '.gitignore', 'run.sh']
DIRECTORIES = ['src', 'public', 'scripts', 'tests', 'docs', 'deploy', 'pterodactyl', '.github', 'node_modules']

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if ROOT in output.parents:
        parser.error('Write releases outside the project to avoid publishing archives.')
    if not (ROOT / 'node_modules/express/package.json').is_file():
        parser.error('Install production dependencies with npm ci --omit=dev --ignore-scripts first.')
    files = [ROOT / name for name in FILES]
    for directory in DIRECTORIES:
        files.extend(p for p in (ROOT / directory).rglob('*') if p.is_file())
    files = sorted(set(files), key=lambda p: p.relative_to(ROOT).as_posix())
    manifest = {}
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in files:
            name = file.relative_to(ROOT).as_posix()
            # Never follow links or include private files, even under an allowed directory.
            if file.is_symlink() or ROOT not in file.resolve().parents:
                raise ValueError(f'Unsupported link: {name}')
            if any(part in ['.git', 'data', 'logs', 'design', '__pycache__'] for part in file.relative_to(ROOT).parts[:1]):
                raise ValueError(f'Private path: {name}')
            if file.name.startswith('.env') and file.name not in ['.env.example', '.env.production.template']:
                raise ValueError(f'Private environment file: {name}')
            if file.suffix.lower() in ['.pem', '.key', '.p12', '.pfx', '.node', '.log', '.zip', '.gz']:
                raise ValueError(f'Unexpected release file: {name}')
            payload = file.read_bytes()
            if file.suffix in ['.sh', '.js', '.mjs', '.json', '.css', '.html', '.md', '.yml', '.svg']:
                payload = payload.replace(b'\r\n', b'\n')
            manifest[name] = hashlib.sha256(payload).hexdigest()
            entry = zipfile.ZipInfo(name)
            entry.create_system = 3
            mode = 0o755 if file.suffix == '.sh' else 0o644
            entry.external_attr = (stat.S_IFREG | mode) << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, payload)
        archive.writestr('RELEASE-MANIFEST.json', json.dumps({'algorithm': 'SHA-256', 'files': [{'path': name, 'sha256': digest} for name, digest in manifest.items()]}, indent=2) + '\n')
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + '.sha256').write_text(f'{digest}  {output.name}\n', encoding='ascii')
    print(f'{output}: {len(manifest)} files, {output.stat().st_size:,} bytes')
    print(f'SHA-256: {digest}')

if __name__ == '__main__':
    main()
