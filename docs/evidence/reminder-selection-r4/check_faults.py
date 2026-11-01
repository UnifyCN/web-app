from pathlib import Path
import hashlib,json,subprocess,time
root=Path.cwd(); ev=root/'docs/evidence/reminder-selection-r4'
files=['app/(main)/companion/page.tsx','app/(main)/checklist/page.tsx','components/companion/tasks/TaskActionsDrawer.tsx','hooks/useAccountId.ts','hooks/useProfile.ts','lib/companion/clearPrivateAccountWork.ts']
original={f:(root/f).read_bytes() for f in files}
def run(name):
 start=time.monotonic()
 with (ev/(name+'.log')).open('wb') as log:
  result=subprocess.run(['npx','vitest','run','components/companion/tasks/TaskSelectionAccountSession.test.tsx','--reporter=json','--outputFile='+str(ev/(name+'.json'))],stdout=log,stderr=subprocess.STDOUT)
 data=json.loads((ev/(name+'.json')).read_text())
 failures=[{'name':t['fullName'],'message':t['failureMessages'][0][:600]} for f in data['testResults'] for t in f['assertionResults'] if t['status']=='failed']
 return {'name':name,'exit':result.returncode,'seconds':time.monotonic()-start,'passed':data['numPassedTests'],'failed':data['numFailedTests'],'failures':failures}
results=[]
try:
 for f in files:
  (root/f).write_bytes(subprocess.check_output(['git','show','660e9ca83882bc62361627b615ef923bfc0b9fa8:'+f]))
 results.append(run('final-cases-on-base'))
finally:
 for f,data in original.items():(root/f).write_bytes(data)
faults=[
 ('drawer-keeps-selection',files[2],'key={generation}','key={0}'),
 ('companion-keeps-open-view',files[0],'key={generation}','key={0}'),
 ('checklist-keeps-open-view',files[1],'key={generation}','key={0}'),
 ('profile-not-cleared',files[5],'if (keepAccountId == null)','if (false)'),
 ('profile-owner-not-checked',files[0],'const currentUser = profile?.id === accountId ? profile : undefined;','const currentUser = profile;'),
 ('pending-generation-zero',files[3],'return useSyncExternalStore(subscribeAccountEpoch, accountEpoch, () => 0);','return useAccountId() === undefined ? 0 : accountEpoch();'),
]
for name,f,old,new in faults:
 try:
  text=original[f].decode();assert text.count(old)==1,(name,text.count(old))
  (root/f).write_text(text.replace(old,new));results.append(run('fault-'+name))
 finally:(root/f).write_bytes(original[f])
assert all((root/f).read_bytes()==data for f,data in original.items())
(ev/'fault-results.json').write_text(json.dumps({'results':results,'restored':{f:hashlib.sha256(data).hexdigest() for f,data in original.items()}},indent=2)+'\n')
print(json.dumps([{'name':r['name'],'exit':r['exit'],'passed':r['passed'],'failed':r['failed']} for r in results]))
