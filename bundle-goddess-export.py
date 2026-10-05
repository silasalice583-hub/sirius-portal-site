"""Refresh the portable archive without modifying PDF source files."""
import json
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent
base = root / 'exports' / '女神回归-2026-09-09至2026-09-21'
manifest_path = Path(str(base) + '-校验清单.json')
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
target = Path(str(base) + '-完整留存包.zip')
support = ['pdf-inline-viewer.js', 'pdf-prepared-reader.js', 'app.js', 'cosmic-refinement.css',
           'pdf-chunk-response.mjs', 'goddess-pdf-parts.mjs', 'functions/content/goddess-return/01/original.pdf.js',
           'build-goddess-reader.cjs', 'prepare-goddess-deployment.cjs', 'bundle-goddess-export.py']
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=3) as archive:
    for suffix in ['-文章配置.json', '-校验清单.json', '-恢复说明.md']:
        item = Path(str(base) + suffix)
        archive.write(item, item.name)
    for entry in manifest['files']:
        source = root / entry['path']
        if not source.exists() and entry['path'] == 'content/goddess-return/01/original.pdf':
            original = b''.join((root / part['path'].lstrip('/')).read_bytes() for part in manifest['originalDownload']['parts'])
            archive.writestr(entry['path'], original)
        else:
            archive.write(source, entry['path'])
    for item in support:
        archive.write(root / item, 'viewer-support/' + item)
print(json.dumps({'archive': str(target), 'bytes': target.stat().st_size, 'assets': len(manifest['files'])}, ensure_ascii=False))
