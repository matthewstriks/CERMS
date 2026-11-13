"""Export the current desktop source snapshot, honoring Git ignore rules.

No .git history/remotes, ignored credentials, node_modules, or installer output.
The resulting folder can become a fresh CERMS-5 GitHub repository.
"""
import json
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
paths = subprocess.check_output(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root
).decode().split('\0')
output = root / 'release' / f'CERMS-5-source-{version}.zip'
output.parent.mkdir(exist_ok=True)
count = 0
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(set(paths)):
        if not name:
            continue
        path = root / name
        if path.is_symlink() or not path.is_file():
            continue
        if name.startswith(('.git/', 'node_modules/', 'out/', 'release/', 'artifacts/')):
            continue
        if path.name.startswith('.env') and path.name != '.env.example':
            continue
        if path.suffix.lower() in ('.p12', '.p8', '.pem', '.key'):
            raise RuntimeError('Refusing to export a private key/certificate file')
        archive.write(path, 'CERMS-5/' + name)
        count += 1
print(f'Exported {count} source files to {output.name}; ignored files and Git history excluded.')
