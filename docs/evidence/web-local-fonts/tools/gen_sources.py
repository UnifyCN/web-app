"""Build app/fonts/sources.json: provenance plus the reference the tests bind to.

faces: every @font-face of the four captured Google CSS responses, in order.
fallbacks/variables: from the original next/font/google build CSS.
preload: the five files the original next-font-manifest preloaded.
"""
import json, re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from parse_google_css import faces as google_faces
S = pathlib.Path(__file__).parent
E = pathlib.Path('/tmp/unify-companion-359/web-font-build-r1-evidence')
GF_COMMIT = (S / 'licenses/google-fonts-commit.txt').read_text().strip()
dl = {r['file']: r for r in json.loads((S / 'download/download-records.json').read_text())}
meta = {r['file']: r for r in json.loads((S / 'download/font-metadata.json').read_text())}
FAMILY = {'Inter': ('Inter', 'inter', 'OFL-Inter.txt'), 'Noto_Sans_Devanagari': ('Noto Sans Devanagari', 'notosansdevanagari', 'OFL-NotoSansDevanagari.txt'), 'Noto_Sans_Arabic': ('Noto Sans Arabic', 'notosansarabic', 'OFL-NotoSansArabic.txt'), 'Noto_Sans_Gurmukhi': ('Noto Sans Gurmukhi', 'notosansgurmukhi', 'OFL-NotoSansGurmukhi.txt')}
fs = google_faces()
files, seen = [], set()
for f in fs:
    if f['file'] in seen:
        continue
    seen.add(f['file'])
    r = dl[f['file']]
    files.append({'file': f['file'], 'family': FAMILY[f['functionName']][0], 'subset': f['subset'], 'sourceUrl': r['url'], 'bytes': r['bytes'], 'sha256': r['sha256'], 'fontVersion': meta[f['file']]['version']})
faces = []
for f in fs:
    face = {'family': f['font-family'].strip("'"), 'style': f['font-style'], 'weight': f['font-weight']}
    if 'font-stretch' in f:
        face['stretch'] = f['font-stretch']
    face.update({'display': f['font-display'], 'unicodeRange': f['unicode-range'], 'file': f['file']})
    faces.append(face)
gen = (E / 'normal-generated/116ggvue5vwuz.css').read_text()
fallbacks = []
for m in re.finditer(r'@font-face\{font-family:([^;]*Fallback);src:local\(([^)]*)\);ascent-override:([^;]*);descent-override:([^;]*);line-gap-override:([^;]*);size-adjust:([^}]*)\}', gen):
    fallbacks.append({'family': m.group(1), 'local': m.group(2), 'ascentOverride': m.group(3), 'descentOverride': m.group(4), 'lineGapOverride': m.group(5), 'sizeAdjust': m.group(6)})
variables = [[m.group(1), m.group(2)] for m in re.finditer(r'\.[a-z_0-9]+-module__[A-Za-z0-9_]+__variable\{(--font-[a-z-]+):([^}]*)\}', gen)]
licenses = []
for fn, (fam, slug, lic) in FAMILY.items():
    text = (S / f'licenses/{slug}-OFL.txt').read_text()
    licenses.append({'family': fam, 'file': lic, 'copyright': text.splitlines()[0], 'sourceUrl': f'https://github.com/google/fonts/blob/{GF_COMMIT}/ofl/{slug}/OFL.txt'})
preload = ['inter-latin.woff2', 'inter-vietnamese.woff2', 'noto-sans-devanagari-devanagari.woff2', 'noto-sans-arabic-arabic.woff2', 'noto-sans-gurmukhi-gurmukhi.woff2']
out = {
    '_comment': 'Provenance of the self-hosted fonts and the reference that app/fonts/fonts.test.ts binds fonts.css, preload.ts and the files to. faces = the Google Fonts css2 responses captured 2026-10-27 (display=swap, the next/font/google request); fallbacks and variables = the CSS next/font/google generated for them; preload = the files its manifest preloaded.',
    'capturedUTC': '2026-10-27T21:35:34Z',
    'files': files, 'faces': faces, 'fallbacks': fallbacks, 'variables': variables, 'preload': preload, 'licenses': licenses,
}
pathlib.Path(sys.argv[1]).write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
print(len(files), len(faces), len(fallbacks), variables, len(licenses))
