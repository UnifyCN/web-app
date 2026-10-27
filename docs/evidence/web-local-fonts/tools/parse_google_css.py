"""Parse the captured Google CSS responses into an ordered face list."""
import re, pathlib
E = pathlib.Path('/tmp/unify-companion-359/web-font-build-r1-evidence')
FAMILIES = [('Inter', 'inter'), ('Noto_Sans_Devanagari', 'noto-sans-devanagari'), ('Noto_Sans_Arabic', 'noto-sans-arabic'), ('Noto_Sans_Gurmukhi', 'noto-sans-gurmukhi')]

def faces():
    out = []
    for fn, slug in FAMILIES:
        css = (E / f'live-{fn}.css').read_text()
        for m in re.finditer(r'/\* ([a-z0-9-]+) \*/\s*@font-face \{(.*?)\}', css, re.S):
            subset, body = m.group(1), m.group(2)
            desc = {k.strip(): v.strip() for k, v in re.findall(r'([a-z-]+):\s*([^;]+);', body)}
            url = re.search(r"url\(([^)]+)\)", desc['src']).group(1)
            out.append({'functionName': fn, 'slug': slug, 'subset': subset, 'url': url, 'file': f'{slug}-{subset}.woff2', **{k: v for k, v in desc.items() if k != 'src'}})
    return out
