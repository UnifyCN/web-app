import hashlib, json, sys, urllib.request, datetime, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from parse_google_css import faces
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36'
out = pathlib.Path(sys.argv[1])
fs = faces()
uniq = {}
for f in fs:
    assert uniq.setdefault(f['url'], f['file']) == f['file'], f
recs = []
for url, name in uniq.items():
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    t = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read(); status = r.status; ctype = r.headers.get('content-type'); clen = r.headers.get('content-length'); lm = r.headers.get('last-modified')
    (out / name).write_bytes(body)
    recs.append({'file': name, 'url': url, 'requestedUTC': t, 'httpStatus': status, 'contentType': ctype, 'contentLength': clen, 'lastModified': lm, 'bytes': len(body), 'magic': body[:4].decode('latin1'), 'sha256': hashlib.sha256(body).hexdigest()})
(out / 'download-records.json').write_text(json.dumps(recs, indent=2) + '\n')
print(len(fs), 'faces', len(recs), 'unique files')
for r in recs: print(r['httpStatus'], r['contentType'], r['contentLength'], r['bytes'], r['magic'], r['sha256'][:16], r['file'])
