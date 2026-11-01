"""Bounded build runner for the local-fonts correction.

--blocked wraps the command in a macOS sandbox that denies every outbound
network connection except loopback, and points HTTP(S)_PROXY at a local
logging proxy (port 3126) that answers 403 to every request. Direct attempts
are denied by the kernel and recorded from the unified log; proxied attempts
are recorded by the proxy.
"""
import argparse, datetime, json, os, pathlib, signal, socket, subprocess, time

ROOT = '/tmp/unify-review-actions-361-web-r5-deno-candidate-9d05'
WORK = pathlib.Path(ROOT) / 'build/local-fonts-work'
OUT = WORK / 'runs'
p = argparse.ArgumentParser()
p.add_argument('--name', required=True)
p.add_argument('--timeout', type=int, required=True)
p.add_argument('--mock')
p.add_argument('--blocked', action='store_true')
p.add_argument('--env', action='append', default=[])
p.add_argument('command', nargs=argparse.REMAINDER)
a = p.parse_args()
cmd = a.command[1:] if a.command[:1] == ['--'] else a.command
env = os.environ.copy()
removed = []
for key in list(env):
    if key.startswith(('NEXT_PUBLIC_SUPABASE_', 'NEXT_PUBLIC_SANITY_', 'SENTRY_', 'SUPABASE_', 'OPENROUTER_', 'SANITY_')) or key in ('NEXT_FONT_GOOGLE_MOCKED_RESPONSES', 'NODE_OPTIONS') or key.lower() in ('http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'):
        removed.append(key)
        env.pop(key)
env['NEXT_TELEMETRY_DISABLED'] = '1'
if a.mock:
    env['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'] = a.mock
for kv in a.env:
    k, v = kv.split('=', 1)
    env[k] = v
proxy = None
proxy_log = OUT / (a.name + '.proxy.jsonl')
if a.blocked:
    with socket.socket() as s:
        if s.connect_ex(('127.0.0.1', 3126)) == 0:
            raise SystemExit('port 3126 busy')
    proxy_log.write_text('')
    proxy = subprocess.Popen(['node', str(WORK / 'blocker/proxy.mjs'), '3126', str(proxy_log)], start_new_session=True)
    for _ in range(50):
        if proxy_log.read_text():
            break
        time.sleep(0.1)
    for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'):
        env[k] = 'http://127.0.0.1:3126'
    cmd = ['sandbox-exec', '-f', str(WORK / 'blocker/deny-remote.sb')] + cmd
log_start = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
start = time.monotonic()
meta = {'command': cmd, 'cwd': ROOT, 'start_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'timeout_s': a.timeout, 'removed_environment_names': removed, 'mock': a.mock, 'blocked': a.blocked, 'extra_env': a.env}
with (OUT / (a.name + '.log')).open('wb') as log:
    proc = subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    meta.update(pid=proc.pid, pgid=proc.pid)
    try:
        meta['exit_code'] = proc.wait(timeout=a.timeout)
        meta['timed_out'] = False
    except subprocess.TimeoutExpired:
        meta['timed_out'] = True
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
        meta['exit_code'] = proc.returncode
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        meta['remaining_group_term_sent'] = True
    except ProcessLookupError:
        meta['remaining_group_term_sent'] = False
meta['elapsed_s'] = round(time.monotonic() - start, 3)
meta['end_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
meta['log_bytes'] = (OUT / (a.name + '.log')).stat().st_size
if proxy:
    time.sleep(2)
    os.killpg(proxy.pid, signal.SIGTERM)
    proxy.wait()
    recs = [json.loads(l) for l in proxy_log.read_text().splitlines() if l.strip()]
    meta['proxy_requests'] = [r for r in recs if r['kind'] != 'listening']
    denials = subprocess.run(['/usr/bin/log', 'show', '--start', log_start, '--predicate', 'eventMessage CONTAINS "deny(1) network-outbound"', '--style', 'compact'], capture_output=True, text=True).stdout.splitlines()
    meta['sandbox_network_denials'] = [l for l in denials if 'Sandbox:' in l and 'deny(1) network-outbound' in l]
(OUT / (a.name + '.json')).write_text(json.dumps(meta, indent=2) + '\n')
print(json.dumps({k: v for k, v in meta.items() if k not in ('removed_environment_names',)}, indent=2))
raise SystemExit(124 if meta['timed_out'] else meta['exit_code'])
