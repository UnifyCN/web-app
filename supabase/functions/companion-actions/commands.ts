// Clear direct create commands (mobile-app#363). Deterministic, no model: a user's own
// saved message either is one clear command that resolves to one exact task title, is
// an unclear command that needs a question, or is not a command. The action service
// reads the message itself, so a model, page text or a client flag can never make a
// message count as a command.
//
// Supported phrasings, one per supported language (others are not commands):
//   en  "Add a task: <title>", "Create task: <title>", "Add <title> to my checklist"
//   fr  "Ajoute une tâche : <title>"      es  "Añade una tarea: <title>"
//   vi  "Thêm việc: <title>"              hi  "कार्य जोड़ें: <title>"
//   pa  "ਕੰਮ ਜੋੜੋ: <title>"                 ar  "أضف مهمة: <title>"

import { TITLE_MAX } from './contract.ts';
import { profileFactOf, type ProfileFactField } from '../rag-query/lib/context/profileFacts.ts';

export type CommandResolution =
  | { kind: 'create'; title: string }
  | { kind: 'clarify'; reason: 'missing_title' | 'multiple' | 'too_long' }
  | { kind: 'none' };

// "<verb> <task noun> : <title>" per language. The title group may be empty (unclear).
const WITH_TITLE: RegExp[] = [
  /^(?:please\s+)?(?:add|create)\s+(?:a\s+)?(?:new\s+)?task\s*[:\-–]\s*(.*)$/iu,
  /^(?:ajoute|ajouter|ajoutez|crée|créer|créez)\s+(?:une\s+)?(?:nouvelle\s+)?tâche\s*:\s*(.*)$/iu,
  /^(?:añade|añadir|agrega|agregar|crea|crear)\s+(?:una\s+)?(?:nueva\s+)?tarea\s*:\s*(.*)$/iu,
  /^thêm\s+(?:một\s+)?(?:việc|nhiệm vụ|công việc)\s*:\s*(.*)$/iu,
  /^(?:कार्य|काम)\s+जोड़ें\s*:\s*(.*)$/u,
  /^(?:ਕੰਮ|ਕਾਰਜ)\s+ਜੋੜੋ\s*:\s*(.*)$/u,
  /^(?:أضف|اضف)\s+مهمة\s*:\s*(.*)$/u,
];
const TO_CHECKLIST = /^(?:please\s+)?add\s+(.+?)\s+to\s+my\s+checklist[.!]?$/iu;
// The command verb and noun with no title at all.
const BARE: RegExp[] = [
  /^(?:please\s+)?(?:add|create)\s+(?:a\s+)?(?:new\s+)?task[.!?]?$/iu,
  /^(?:ajoute|ajouter|ajoutez|crée|créer|créez)\s+(?:une\s+)?(?:nouvelle\s+)?tâche[.!?]?$/iu,
  /^(?:añade|añadir|agrega|agregar|crea|crear)\s+(?:una\s+)?(?:nueva\s+)?tarea[.!?]?$/iu,
  /^thêm\s+(?:một\s+)?(?:việc|nhiệm vụ|công việc)[.!?]?$/iu,
  /^(?:कार्य|काम)\s+जोड़ें[।.!?]?$/u,
  /^(?:ਕੰਮ|ਕਾਰਜ)\s+ਜੋੜੋ[।.!?]?$/u,
  /^(?:أضف|اضف)\s+مهمة[.!؟?]?$/u,
];

function lineCommand(line: string): CommandResolution {
  for (const re of WITH_TITLE) {
    const m = line.match(re);
    if (m) return titled(m[1]);
  }
  const to = line.match(TO_CHECKLIST);
  if (to) return titled(to[1]);
  if (BARE.some(re => re.test(line))) return { kind: 'clarify', reason: 'missing_title' };
  return { kind: 'none' };
}

function titled(raw: string): CommandResolution {
  const title = raw.trim().replace(/^["“”'«]+|["“”'»]+$/gu, '').replace(/[.。।]+$/u, '').trim();
  if (!title) return { kind: 'clarify', reason: 'missing_title' };
  if (title.length > TITLE_MAX) return { kind: 'clarify', reason: 'too_long' };
  return { kind: 'create', title };
}

/** What the user's own message asks for. */
export function resolveCommand(text: string): CommandResolution {
  const lines = text.normalize('NFC').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { kind: 'none' };
  const resolved = lines.map(lineCommand);
  const commands = resolved.filter(r => r.kind !== 'none');
  if (commands.length === 0) return { kind: 'none' };
  // A command with more lines (a second command, or a title over several lines) is unclear.
  if (lines.length > 1) return { kind: 'clarify', reason: 'multiple' };
  return commands[0];
}

/** How titles are compared for "a task with this title exists" (SQL: companion_title_key). */
export const titleKey = (title: string) => title.trim().replace(/\s+/gu, ' ').toLowerCase();

// ------------------------------------------------------------------ #370 remember
// Clear "remember" commands for saved personal details (mobile-app#370). Same rules: the
// action service reads the user's own saved message; a clear command saves exactly the
// stated detail, an unclear one gets a question, a profile fact is refused (the profile
// owns it), anything else is not a command. One phrasing family per supported language:
//   en  "Remember that <detail>", "Remember: <detail>"
//   fr  "Souviens-toi que <detail>"     es  "Recuerda que <detail>"
//   vi  "Hãy nhớ rằng <detail>"          hi  "याद रखें कि <detail>"
//   pa  "ਯਾਦ ਰੱਖੋ ਕਿ <detail>"             ar  "تذكر أن <detail>", "تذكر أنني <detail>"
// "Remember this/that/it" (and the same in each language) names nothing: it is unclear.
// Arabic attaches the subject pronoun to أن: "أنني" is "that I". The detail keeps a first
// person as its separate pronoun (أنا, نحن), so it still says who it is about; any other
// attached form (أنه, أنها, …) is unclear rather than cut into a broken word.


/** Longest saved detail (SQL: companion_detail_text_ok). */
export const DETAIL_MAX = 300;

export type RememberResolution =
  | { kind: 'remember'; text: string }
  | { kind: 'remember_clarify'; reason: 'missing_detail' | 'unclear_reference' | 'multiple' | 'too_long' }
  | { kind: 'profile_fact'; field: ProfileFactField }
  | { kind: 'none' };

// Polite opener, verb, then ":" or the "that" word. The detail group may be empty.
const REMEMBER: { verb: RegExp; that: string; deictic: string }[] = [
  { verb: /(?:please\s+)?remember/iu, that: 'that\\b', deictic: 'this|that|it' },
  { verb: /(?:s['’]il te pla[iî]t,?\s+)?(?:souviens-toi|souvenez-vous|rappelle-toi|retiens|retenez|mémorise)/iu,
    that: "que\\b|qu['’]", deictic: 'ça|cela|ceci' },
  { verb: /(?:por favor,?\s+)?(?:recuerda|recuerde|memoriza)/iu, that: 'que\\b', deictic: 'esto|eso' },
  { verb: /(?:hãy\s+)?(?:ghi nhớ|nhớ)/iu, that: 'rằng|là', deictic: 'điều này|điều đó' },
  { verb: /(?:कृपया\s+)?याद\s+(?:रखें|रखना|रखो)/u, that: 'कि', deictic: 'यह|ये|इसे' },
  { verb: /(?:ਕਿਰਪਾ ਕਰਕੇ\s+)?ਯਾਦ\s+(?:ਰੱਖੋ|ਰੱਖਣਾ|ਰੱਖ)/u, that: 'ਕਿ', deictic: 'ਇਹ|ਇਸ ਨੂੰ' },
  { verb: /(?:من فضلك\s+)?(?:تذكر|تذكّر|احفظ)/u, that: '(?:أن|ان)[\\u064B-\\u0652]*(?!\\p{L})', deictic: 'هذا|ذلك' },
];
const AR_VERB = REMEMBER[REMEMBER.length - 1].verb.source;
/** "that" + attached pronoun, with optional shadda/short vowels: first person singular and plural. */
const AR_MARKS = '[\\u064B-\\u0652]*';
const AR_THAT_I = new RegExp(`^${AR_VERB}\\s+[أا]ن${AR_MARKS}(?:ن${AR_MARKS})?ي${AR_MARKS}(?!\\p{L})\\s*(.*)$`, 'u');
const AR_THAT_WE = new RegExp(`^${AR_VERB}\\s+[أا]ن${AR_MARKS}ن${AR_MARKS}ا${AR_MARKS}(?!\\p{L})\\s*(.*)$`, 'u');
const AR_THAT_OTHER = new RegExp(`^${AR_VERB}\\s+[أا]ن${AR_MARKS}\\p{L}`, 'u');
const END = '[.!?।؟]*';
const WITH_DETAIL = REMEMBER.map(r => new RegExp(`^${r.verb.source}\\s*(?::|\\s(?:${r.that}))\\s*(.*)$`, 'iu'));
const DEICTIC = REMEMBER.map(r => new RegExp(`^${r.verb.source}(?:\\s+(?:${r.deictic}))?${END}$`, 'iu'));

function rememberLine(line: string): RememberResolution {
  const firstPerson = line.match(AR_THAT_I) ?? line.match(AR_THAT_WE);
  if (firstPerson) {
    const rest = firstPerson[1].trim();
    return rest ? detailOf(`${AR_THAT_I.test(line) ? 'أنا' : 'نحن'} ${rest}`) : detailOf('');
  }
  for (const re of WITH_DETAIL) {
    const m = line.match(re);
    if (m) return detailOf(m[1]);
  }
  if (DEICTIC.some(re => re.test(line)) || AR_THAT_OTHER.test(line)) {
    return { kind: 'remember_clarify', reason: 'unclear_reference' };
  }
  return { kind: 'none' };
}

function detailOf(raw: string): RememberResolution {
  const text = raw.trim().replace(/^["“”'«]+|["“”'»]+$/gu, '').replace(/[.。।]+$/u, '').trim();
  if (!text) return { kind: 'remember_clarify', reason: 'missing_detail' };
  if (REMEMBER.some(r => new RegExp(`^(?:${r.deictic})${END}$`, 'iu').test(text))) {
    return { kind: 'remember_clarify', reason: 'unclear_reference' };
  }
  if (text.length > DETAIL_MAX) return { kind: 'remember_clarify', reason: 'too_long' };
  const field = profileFactOf(text);
  if (field) return { kind: 'profile_fact', field };
  return { kind: 'remember', text };
}

/** What the user's own message asks to remember, if anything. */
export function resolveRemember(text: string): RememberResolution {
  const lines = text.normalize('NFC').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { kind: 'none' };
  const first = rememberLine(lines[0]);
  if (first.kind === 'none') return first;
  // A detail over several lines, or a second request, is unclear.
  if (lines.length > 1) return { kind: 'remember_clarify', reason: 'multiple' };
  return first;
}
