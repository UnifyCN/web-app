"""Machine comparison of original (next/font/google) vs candidate (self-hosted) build output.

Inputs: baseline-out/ (normal build of 02377a33 today), the diagnostic's
normal-generated CSS + manifest (same commit, 21:35Z, v30 Devanagari), and
candidate-out/. Files are compared by SHA-256 where bytes exist and by the
Turbopack content-hash suffix otherwise.
"""
import hashlib, json, pathlib, re, sys
S = pathlib.Path(__file__).parent
E = pathlib.Path('/tmp/unify-companion-359/web-font-build-r1-evidence/normal-generated')

def suffix(name):
    # Turbopack content hash. next/font names: <urlhash>-s[.p].<hash>.woff2;
    # plain asset names: <stem>.<hash>.woff2. The hash itself may contain dots.
    stem = name[:-len('.woff2')]
    m = re.match(r'^[0-9a-f]{16}-s\.(?:p\.)?(.+)$', stem)
    return m.group(1) if m else stem.split('.', 1)[1]

def faces(css):
    out = []
    for m in re.finditer(r'@font-face\{([^}]*)\}', css):
        d = dict(re.findall(r'([a-z-]+):((?:url\([^)]*\)format\("[^"]*"\))|[^;]+)', m.group(1)))
        src = d.pop('src')
        u = re.match(r'url\(\.\./media/([^)]+)\)format\("woff2"\)', src)
        if u:
            d['file_hash'] = suffix(u.group(1)); d['_name'] = u.group(1)
        else:
            d['src'] = src
        out.append(d)
    return out

def variables(css):
    v = re.findall(r'(--font-(?:inter|noto-[a-z]+)):("[^}]*?)(?=[;}])', css)
    return [[k, val] for k, val in v]

def strip_font_rules(css):
    css = re.sub(r'@font-face\{[^}]*\}', '', css)
    css = re.sub(r'\.[a-z_0-9]+-module__[A-Za-z0-9_]+__(?:className|variable)\{[^}]*\}', '', css)
    css = re.sub(r':root\{--font-inter:[^}]*\}', '', css)
    return re.sub(r'\n+', '\n', css).strip()  # module boundaries add blank lines

def link_preloads(headers):
    h = next((l for l in headers.splitlines() if l.lower().startswith('link:')), '')
    out = []
    for part in re.findall(r'<([^>]+)>;([^,]*(?:,(?!\s*<)[^,]*)*)', h):
        out.append({'href': part[0], 'attrs': part[1].strip()})
    return out

def html_root(html):
    m = re.search(r'<html([^>]*)>', html)
    attrs = dict(re.findall(r'(\w[\w-]*)="([^"]*)"', m.group(1)))
    return attrs

res = {}
base_css = (S / 'baseline-out/baseline-font-chunk.css').read_text()
diag_css = (E / '116ggvue5vwuz.css').read_text()
cand_css = (S / 'candidate-out/candidate-font-chunk.css').read_text()
bf, df, cf = faces(base_css), faces(diag_css), faces(cand_css)
base_sha = {l.split()[1]: l.split()[0] for l in (S / 'baseline-out/media-sha256.txt').read_text().splitlines()}
cand_sha = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (S / 'candidate-out/media').glob('*.woff2')}

def cmp_faces(a, b, a_sha=None):
    diffs = []
    if len(a) != len(b):
        diffs.append(f'count {len(a)} != {len(b)}')
    for i, (x, y) in enumerate(zip(a, b)):
        kx = {k: v for k, v in x.items() if k != '_name'}; ky = {k: v for k, v in y.items() if k != '_name'}
        if kx != ky:
            diffs.append({'index': i, 'original': kx, 'candidate': ky})
        elif a_sha is not None and '_name' in x and a_sha.get(x['_name']) != cand_sha.get(y['_name']):
            diffs.append({'index': i, 'sha_differs': [x['_name'], y['_name']]})
    return diffs

res['faces_total'] = {'diagnostic_v30': len(df), 'baseline_today': len(bf), 'candidate': len(cf)}
res['faces_with_file'] = {'diagnostic_v30': sum('file_hash' in f for f in df), 'candidate': sum('file_hash' in f for f in cf)}
res['fallback_faces'] = [f for f in cf if 'src' in f]
ff = lambda fs: [f for f in fs if 'file_hash' in f]
fb = lambda fs: sorted((f for f in fs if 'src' in f), key=lambda f: f['font-family'])
res['file_faces_diff_vs_diagnostic_v30_build'] = cmp_faces(ff(df), ff(cf))
res['file_faces_diff_vs_baseline_today_build'] = cmp_faces(ff(bf), ff(cf), base_sha)
res['fallback_faces_diff_vs_diagnostic_v30_build'] = cmp_faces(fb(df), fb(cf))
res['fallback_faces_diff_vs_baseline_today_build'] = cmp_faces(fb(bf), fb(cf))
res['unique_files'] = {'diagnostic_v30': len({f['file_hash'] for f in df if 'file_hash' in f}), 'candidate': len({f['file_hash'] for f in cf if 'file_hash' in f}), 'candidate_media_dir': len(cand_sha)}
res['variables'] = {'diagnostic_v30': variables(diag_css), 'baseline_today': variables(base_css), 'candidate': variables(cand_css)}
res['variables_equal'] = res['variables']['diagnostic_v30'] == res['variables']['candidate'] == res['variables']['baseline_today']
res['non_font_css_equal_to_baseline_today'] = strip_font_rules(base_css) == strip_font_rules(cand_css)
res['non_font_css_equal_to_diagnostic'] = strip_font_rules(diag_css) == strip_font_rules(cand_css)
font_rule_first = lambda css: css.find('@font-face') < css.find('@layer')
res['font_rules_before_tailwind_layers'] = {'baseline': font_rule_first(base_css), 'candidate': font_rule_first(cand_css)}
bm = json.loads((S / 'baseline-out/next-font-manifest.json').read_text())
dm = json.loads((E / 'next-font-manifest.json').read_text())
cm = json.loads((S / 'candidate-out/next-font-manifest.json').read_text())
res['manifest'] = {
    'diagnostic_v30': {'pages': len(dm['app']), 'preload_sets': sorted({tuple(sorted(suffix(x.rsplit('/', 1)[1]) for x in v)) for v in dm['app'].values()}), 'appUsingSizeAdjust': dm['appUsingSizeAdjust']},
    'baseline_today': {'pages': len(bm['app']), 'preload_sets': sorted({tuple(sorted(suffix(x.rsplit('/', 1)[1]) for x in v)) for v in bm['app'].values()}), 'appUsingSizeAdjust': bm['appUsingSizeAdjust']},
    'candidate': {'pages': len(cm['app']), 'preload_sets': sorted({tuple(v) for v in cm['app'].values()}), 'appUsingSizeAdjust': cm['appUsingSizeAdjust']},
}
bl = link_preloads((S / 'baseline-out/welcome.headers').read_text())
cl = link_preloads((S / 'candidate-out/welcome.headers').read_text())
norm = lambda ls: sorted((suffix(l['href'].rsplit('/', 1)[1]) if l['href'].endswith('.woff2') else l['href'], l['attrs']) for l in ls)
res['welcome_link_header'] = {'baseline_today': norm(bl), 'candidate': norm(cl)}
bset = {x for x in norm(bl)}; cset = {x for x in norm(cl)}
res['welcome_link_only_in_candidate'] = sorted(cset - bset)
res['welcome_link_only_in_baseline'] = sorted(bset - cset)
v30_preload = set(res['manifest']['diagnostic_v30']['preload_sets'][0])
res['candidate_preloads_equal_diagnostic_v30_manifest'] = {s for s, a in cset if a.startswith('rel=preload')} == v30_preload
bh = html_root((S / 'baseline-out/welcome.html').read_text()); ch = html_root((S / 'candidate-out/welcome.html').read_text())
font_cls = lambda c: [x for x in c.split() if '-module__' in x]
res['html_root'] = {
    'non_font_classes_equal': [x for x in bh['class'].split() if '-module__' not in x] == ch['class'].split(),
    'baseline_font_classes': font_cls(bh['class']), 'candidate_classes': ch['class'].split(),
    'style_equal': bh['style'] == ch['style'], 'lang_dir_equal': (bh['lang'], bh['dir']) == (ch['lang'], ch['dir']),
}
sz = lambda h: '<meta name="next-size-adjust"' in h
res['next_size_adjust_meta'] = {'baseline': sz((S / 'baseline-out/welcome.html').read_text()), 'candidate': sz((S / 'candidate-out/welcome.html').read_text())}
src = json.loads(pathlib.Path('app/fonts/sources.json').read_text())
by_file = {f['file']: f['sha256'] for f in src['files']}
res['candidate_media_sha_matches_sources'] = all(cand_sha[n] == by_file[n.split('.')[0] + '.woff2'] for n in cand_sha)
res['candidate_media_matches_baseline_today_bytes'] = sorted(n for n in cand_sha if cand_sha[n] in base_sha.values())
res['candidate_media_not_in_baseline_today'] = sorted(n for n in cand_sha if cand_sha[n] not in base_sha.values())
json.dump(res, open(sys.argv[1], 'w'), indent=1)
for k, v in res.items():
    if k not in ('variables', 'welcome_link_header', 'fallback_faces', 'manifest', 'candidate_media_matches_baseline_today_bytes'):
        print(k, '=>', json.dumps(v)[:400])
print('manifest', json.dumps(res['manifest'])[:900])
