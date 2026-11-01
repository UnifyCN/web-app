import {type ContentLanguage, type ReminderScheduleOperation, parseOperation} from './contract.ts';
/** Only exact, single-line user commands. Missing values are clarification, never guesses. */
const prefixes: [ContentLanguage,RegExp][]=[
 ['en',/^Remind me about task "([^"\n]+)" at (\S+) \[([^\]\n]+)\]$/iu],
 ['fr-CA',/^Rappelle-moi la tâche "([^"\n]+)" à (\S+) \[([^\]\n]+)\]$/iu],
 ['es',/^Recuérdame la tarea "([^"\n]+)" a las (\S+) \[([^\]\n]+)\]$/iu],
 ['vi',/^Nhắc tôi về việc "([^"\n]+)" lúc (\S+) \[([^\]\n]+)\]$/iu],
 ['hi',/^कार्य "([^"\n]+)" की याद (\S+) \[([^\]\n]+)\] पर दिलाएँ$/u],
 ['pa',/^ਕੰਮ "([^"\n]+)" ਦੀ ਯਾਦ (\S+) \[([^\]\n]+)\] ਉੱਤੇ ਦਿਵਾਓ$/u],
 ['ar',/^ذكّرني بالمهمة "([^"\n]+)" في (\S+) \[([^\]\n]+)\]$/u],
];
export function reminderCommand(text:string): {lang:ContentLanguage;title:string;time:Pick<ReminderScheduleOperation,'remind_at'|'wall_time'|'time_zone'>}|null {
 for(const [lang,re] of prefixes) {
  const m=re.exec(text.trim());if(!m)continue;
  const wall=m[2].replace(/(Z|[+-]\d{2}:\d{2})$/,'');
  const parsed=parseOperation({type:'reminder.schedule',task_ref:'sanity:validation',expected_revision:0,remind_at:m[2],wall_time:wall,time_zone:m[3]});
  if(!parsed.ok || parsed.value.type!=='reminder.schedule') return null;
  return {lang,title:m[1],time:{remind_at:m[2],wall_time:wall,time_zone:m[3]}};
 }
 return null;
}
