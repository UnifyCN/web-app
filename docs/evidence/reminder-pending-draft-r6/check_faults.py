from pathlib import Path
import subprocess,json,hashlib,time
root=Path.cwd();ev=root/'docs/evidence/reminder-pending-draft-r6'
files=['lib/companion/composerDrafts.ts','lib/companion/clearPrivateAccountWork.ts','hooks/useAuthUser.ts','hooks/useAccountId.ts','hooks/useChecklist.ts','components/companion/ChatInput.tsx','components/companion/ChatPanel.tsx','components/companion/StarterPromptChips.tsx','components/learn/help/InLessonChat.tsx']
original={f:(root/f).read_bytes() for f in files}
def run(name):
 start=time.monotonic()
 with (ev/(name+'.log')).open('wb') as log:
  r=subprocess.run(['npx','vitest','run','components/companion/tasks/ComposerPendingSession.test.tsx','--reporter=json','--outputFile='+str(ev/(name+'.json'))],stdout=log,stderr=subprocess.STDOUT)
 d=json.loads((ev/(name+'.json')).read_text());bad=[{'name':t['fullName'],'message':t['failureMessages'][0][:600]} for f in d['testResults'] for t in f['assertionResults'] if t['status']=='failed']
 return {'name':name,'exit':r.returncode,'passed':d['numPassedTests'],'failed':d['numFailedTests'],'seconds':time.monotonic()-start,'failures':bad}
results=[]
try:
 for f in files:(root/f).write_bytes(subprocess.check_output(['git','show','f898e160fce913910e362003aff1aecb79569695:'+f]))
 results.append(run('final-cases-on-base'))
finally:
 for f,data in original.items():(root/f).write_bytes(data)
faults=[
 ('drop-unresolved-text',files[0],[('if (accountId === null) pendingDraft = { owner, text };','if (accountId === null) return;')]),
 ('erase-first-confirmation-input',files[2],[('firstConfirmation ? previousOwner : undefined','undefined')]),
 ('read-error-signs-out',files[3],[('if (isPending || user === undefined)','if (isPending)')]),
 ('checklist-read-before-account',files[4],[('const authPending = isPending || user === undefined;','const authPending = isPending;')]),
 ('enable-pending-main-send',files[6],[('sendDisabled={!accountId}','sendDisabled={false}')]),
 ('enable-pending-lesson-send',files[8],[('sendDisabled={!accountId}','sendDisabled={false}')]),
 ('enable-pending-main-starter',files[7],[('disabled={disabled}','disabled={false}')]),
 ('enable-pending-lesson-starter',files[8],[('disabled={!accountId || createConversation.isPending}','disabled={createConversation.isPending}')]),
 ('clear-keeps-pending-text',files[0],[('if (owner.accountId !== accountId) return;\n    pendingDraft = null;','if (owner.accountId !== accountId) return;')]),
 ('navigation-drops-pending-text',files[0],[('listeners.delete(listener);','listeners.delete(listener);\n    if (!listeners.size) pendingDraft = null;')]),
 ('guess-old-account-while-pending',files[6],[('accountEpoch, stillOwned','accountEpoch, ownAccountWork, stillOwned'),('composerDraft(accountId ?? null)','composerDraft(accountId ?? ownAccountWork().accountId)')]),
]
for name,f,edits in faults:
 try:
  text=original[f].decode()
  for old,new in edits:
   assert text.count(old)==1,(name,old,text.count(old));text=text.replace(old,new)
  (root/f).write_text(text);results.append(run(name))
 finally:(root/f).write_bytes(original[f])
assert all((root/f).read_bytes()==data for f,data in original.items())
(ev/'fault-results.json').write_text(json.dumps({'results':results,'restored':{f:hashlib.sha256(v).hexdigest() for f,v in original.items()}},indent=2)+'\n');print(json.dumps([{'name':r['name'],'exit':r['exit'],'passed':r['passed'],'failed':r['failed']} for r in results]))
