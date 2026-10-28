// Clear direct commands (mobile-app#363 create, #365 edit). Deterministic, no model: a
// user's own saved message either is one clear command that resolves to one exact change,
// is an unclear command that needs a question, or is not a command. The action service
// reads the message itself, so a model, page text or a client flag can never make a
// message count as a command.
//
// Supported create phrasings, one per supported language (others are not commands):
//   en  "Add a task: <title>", "Create task: <title>", "Add <title> to my checklist"
//   fr  "Ajoute une tâche : <title>"      es  "Añade una tarea: <title>"
//   vi  "Thêm việc: <title>"              hi  "कार्य जोड़ें: <title>"
//   pa  "ਕੰਮ ਜੋੜੋ: <title>"                 ar  "أضف مهمة: <title>"
//
// Edit phrasings (#365): the task is named by its title in quotes ("…", “…” or «…»);
// priorities and states are the Checklist's own labels in that language (or English).
// A line has only the quote marks of its one change: a title, a description or a waiting
// reason cannot contain a quote mark, so a second command on the same line is a question.
// The documented examples are in DOCS/companion-actions/365-task-edits.md (mobile repo)
// and are each a server test case (edit_command_test.ts):
//   en  Rename task "<task>" to "<title>"
//       Set description of task "<task>" to "<text>"
//       Set priority of task "<task>" to <priority>
//       Mark task "<task>" as <state>            Mark task "<task>" as waiting: <reason>
//   fr  Renomme la tâche « <task> » en « <title> »
//       Change la description de la tâche « <task> » en « <text> »
//       Mets la priorité de la tâche « <task> » à <priorité>
//       Marque la tâche « <task> » comme <état>  (en attente : <raison>)
//   es  Cambia el nombre de la tarea "<task>" a "<title>"
//       Cambia la descripción de la tarea "<task>" a "<text>"
//       Pon la prioridad de la tarea "<task>" en <prioridad>
//       Marca la tarea "<task>" como <estado>    (en espera: <motivo>)
//   vi  Đổi tên việc "<task>" thành "<title>"
//       Đổi mô tả việc "<task>" thành "<text>"
//       Đặt mức ưu tiên của việc "<task>" là <ưu tiên>
//       Đánh dấu việc "<task>" là <trạng thái>   (đang chờ: <lý do>)
//   hi  कार्य "<task>" का नाम बदलकर "<title>" करें
//       कार्य "<task>" का विवरण बदलकर "<text>" करें
//       कार्य "<task>" की प्राथमिकता <प्राथमिकता> करें
//       कार्य "<task>" को <स्थिति> चिह्नित करें       (…: <कारण>)
//   pa  ਕੰਮ "<task>" ਦਾ ਨਾਮ ਬਦਲ ਕੇ "<title>" ਕਰੋ
//       ਕੰਮ "<task>" ਦਾ ਵੇਰਵਾ ਬਦਲ ਕੇ "<text>" ਕਰੋ
//       ਕੰਮ "<task>" ਦੀ ਤਰਜੀਹ <ਤਰਜੀਹ> ਕਰੋ
//       ਕੰਮ "<task>" ਨੂੰ <ਸਥਿਤੀ> ਮਾਰਕ ਕਰੋ        (…: <ਕਾਰਨ>)
//   ar  غيّر اسم المهمة "<task>" إلى "<title>"
//       غيّر وصف المهمة "<task>" إلى "<text>"
//       اجعل أولوية المهمة "<task>" <الأولوية>
//       اجعل حالة المهمة "<task>" <الحالة>        (في الانتظار: <السبب>)

import {
  type ContentLanguage,
  DESCRIPTION_MAX,
  type Priority,
  TITLE_MAX,
  type TaskState,
  WAITING_REASON_MAX,
} from './contract.ts';

/** One change to one task, named by the title the user wrote (#365). */
export type EditChange =
  | { field: 'title'; value: string }
  | { field: 'description'; value: string }
  | { field: 'priority'; value: Priority }
  | { field: 'state'; value: TaskState; waiting_reason?: string };

export type CommandResolution =
  | { kind: 'create'; title: string }
  | { kind: 'edit'; lang: ContentLanguage; target: string; change: EditChange }
  | {
      kind: 'clarify';
      reason:
        | 'missing_title' | 'multiple' | 'too_long'
        /** #365: an edit value is missing, unknown or too long; a message with an edit has more lines. */
        | 'missing_value' | 'invalid_value' | 'value_too_long' | 'multiple_changes';
    }
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

// ------------------------------------------------------------------- edits (#365)

const OPEN_Q = '["“«„]';
const CLOSE_Q = '["”»“]';
/** A quoted text: the task's title, or a new title or description (may be empty). */
const Q = `${OPEN_Q}\\s*(.*?)\\s*${CLOSE_Q}`;
/** Every quote mark the grammar knows. */
const QUOTE_MARK = /["“”«»„]/gu;

/**
 * The Checklist's priority labels per language, and English. The mobile Checklist
 * (checklist.priority.*) and the web Checklist (checklist.createItem.priority*) word some
 * of them differently; both are understood.
 */
const PRIORITY_WORDS: Record<ContentLanguage, Record<string, Priority>> = {
  en: { 'do now': 'Do now', 'do soon': 'Do soon', 'explore and connect': 'Explore and connect', 'optional / later': 'Optional / later', 'optional': 'Optional / later', 'later': 'Optional / later' },
  'fr-CA': {
    'à faire maintenant': 'Do now', 'à faire bientôt': 'Do soon',
    'explorer et créer des liens': 'Explore and connect', 'explorer et se connecter': 'Explore and connect',
    'optionnel / plus tard': 'Optional / later', 'facultatif / plus tard': 'Optional / later',
  },
  es: {
    'hazlo ahora': 'Do now', 'hacer ahora': 'Do now', 'hazlo pronto': 'Do soon', 'hacer pronto': 'Do soon',
    'explora y conecta': 'Explore and connect', 'explorar y conectar': 'Explore and connect',
    'opcional / más tarde': 'Optional / later', 'opcional / después': 'Optional / later',
  },
  vi: {
    'làm ngay': 'Do now', 'làm sớm': 'Do soon',
    'khám phá và kết nối': 'Explore and connect', 'khám phá & kết nối': 'Explore and connect',
    'tùy chọn / để sau': 'Optional / later', 'tùy chọn / sau': 'Optional / later',
  },
  hi: {
    'अभी करें': 'Do now', 'जल्द करें': 'Do soon', 'जल्दी करें': 'Do soon',
    'खोजें और जुड़ें': 'Explore and connect', 'अन्वेषण करें और जुड़ें': 'Explore and connect',
    'वैकल्पिक / बाद में': 'Optional / later',
  },
  pa: { 'ਹੁਣੇ ਕਰੋ': 'Do now', 'ਜਲਦੀ ਕਰੋ': 'Do soon', 'ਖੋਜੋ ਅਤੇ ਜੁੜੋ': 'Explore and connect', 'ਵਿਕਲਪਿਕ / ਬਾਅਦ ਵਿੱਚ': 'Optional / later' },
  ar: {
    'افعل الآن': 'Do now', 'افعله الآن': 'Do now', 'افعل قريبًا': 'Do soon', 'افعله قريبًا': 'Do soon',
    'استكشف وتواصل': 'Explore and connect', 'اختياري / لاحقًا': 'Optional / later',
  },
};

/** The Checklist's state labels per language (taskActions.state.*), and English. */
const STATE_WORDS: Record<ContentLanguage, Record<string, TaskState>> = {
  en: { 'not started': 'not_started', 'in progress': 'in_progress', 'waiting': 'waiting', 'completed': 'completed', 'complete': 'completed', 'done': 'completed' },
  'fr-CA': { 'pas commencée': 'not_started', 'pas commencé': 'not_started', 'en cours': 'in_progress', 'en attente': 'waiting', 'terminée': 'completed', 'terminé': 'completed' },
  es: { 'sin empezar': 'not_started', 'en curso': 'in_progress', 'en espera': 'waiting', 'completada': 'completed', 'completado': 'completed' },
  vi: { 'chưa bắt đầu': 'not_started', 'đang làm': 'in_progress', 'đang chờ': 'waiting', 'đã xong': 'completed' },
  hi: { 'शुरू नहीं हुआ': 'not_started', 'जारी है': 'in_progress', 'इंतज़ार में': 'waiting', 'इंतजार में': 'waiting', 'पूरा हुआ': 'completed' },
  pa: { 'ਸ਼ੁਰੂ ਨਹੀਂ ਹੋਇਆ': 'not_started', 'ਚੱਲ ਰਿਹਾ ਹੈ': 'in_progress', 'ਉਡੀਕ ਵਿੱਚ': 'waiting', 'ਪੂਰਾ ਹੋਇਆ': 'completed' },
  ar: { 'لم تبدأ': 'not_started', 'قيد التنفيذ': 'in_progress', 'في الانتظار': 'waiting', 'مكتملة': 'completed' },
};

/** Lower case, NFC, single spaces, no closing punctuation: how labels are compared. */
const wordKey = (text: string) =>
  text.normalize('NFC').trim().replace(/[.!।؟?]+$/u, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

function lookup<T>(lang: ContentLanguage, table: Record<ContentLanguage, Record<string, T>>, raw: string): T | null {
  const key = wordKey(raw);
  for (const words of [table[lang], table.en]) {
    for (const [word, value] of Object.entries(words)) if (wordKey(word) === key) return value;
  }
  return null;
}

type EditKind = 'title' | 'description' | 'priority' | 'state';
interface EditPattern {
  lang: ContentLanguage;
  kind: EditKind;
  re: RegExp;
}
const END = '[.!।]?$';
const p = (lang: ContentLanguage, kind: EditKind, source: string, flags = 'iu'): EditPattern =>
  ({ lang, kind, re: new RegExp(source.normalize('NFC'), flags) });

// Group 1: the task's title. Group 2: the new value (title, description, priority word, or
// state word with an optional ": reason"). Group 3 (hi, pa): a reason after the verb.
const EDIT_PATTERNS: EditPattern[] = [
  p('en', 'title', `^(?:please\\s+)?rename\\s+(?:the\\s+)?task\\s+${Q}\\s+to\\s+${Q}${END}`),
  p('en', 'description', `^(?:please\\s+)?(?:set|change)\\s+(?:the\\s+)?description\\s+of\\s+(?:the\\s+)?task\\s+${Q}\\s+to\\s+${Q}${END}`),
  p('en', 'priority', `^(?:please\\s+)?(?:set|change)\\s+(?:the\\s+)?priority\\s+of\\s+(?:the\\s+)?task\\s+${Q}\\s+to\\s+(.+)$`),
  p('en', 'state', `^(?:please\\s+)?mark\\s+(?:the\\s+)?task\\s+${Q}\\s+as\\s+(.+)$`),
  p('fr-CA', 'title', `^renomm(?:e|er|ez)\\s+la\\s+tâche\\s+${Q}\\s+en\\s+${Q}${END}`),
  p('fr-CA', 'description', `^(?:change|changer|changez|modifie|modifier|modifiez)\\s+la\\s+description\\s+de\\s+la\\s+tâche\\s+${Q}\\s+(?:en|pour)\\s+${Q}${END}`),
  p('fr-CA', 'priority', `^(?:mets|mettre|mettez|change|changer|changez)\\s+la\\s+priorité\\s+de\\s+la\\s+tâche\\s+${Q}\\s+(?:à|a|en|pour)\\s+(.+)$`),
  p('fr-CA', 'state', `^(?:marque|marquer|marquez)\\s+la\\s+tâche\\s+${Q}\\s+comme\\s+(.+)$`),
  p('es', 'title', `^(?:cambia|cambiar|cambie)\\s+el\\s+nombre\\s+de\\s+la\\s+tarea\\s+${Q}\\s+a\\s+${Q}${END}`),
  p('es', 'description', `^(?:cambia|cambiar|cambie)\\s+la\\s+descripción\\s+de\\s+la\\s+tarea\\s+${Q}\\s+a\\s+${Q}${END}`),
  p('es', 'priority', `^(?:pon|poner|ponga|cambia|cambiar|cambie)\\s+la\\s+prioridad\\s+de\\s+la\\s+tarea\\s+${Q}\\s+(?:en|a)\\s+(.+)$`),
  p('es', 'state', `^(?:marca|marcar|marque)\\s+la\\s+tarea\\s+${Q}\\s+como\\s+(.+)$`),
  p('vi', 'title', `^đổi\\s+tên\\s+việc\\s+${Q}\\s+thành\\s+${Q}${END}`),
  p('vi', 'description', `^đổi\\s+mô\\s+tả\\s+(?:của\\s+)?việc\\s+${Q}\\s+thành\\s+${Q}${END}`),
  p('vi', 'priority', `^đặt\\s+mức\\s+ưu\\s+tiên\\s+(?:của\\s+)?việc\\s+${Q}\\s+là\\s+(.+)$`),
  p('vi', 'state', `^đánh\\s+dấu\\s+việc\\s+${Q}\\s+là\\s+(.+)$`),
  p('hi', 'title', `^कार्य\\s+${Q}\\s+का\\s+नाम\\s+बदलकर\\s+${Q}\\s+करें${END}`, 'u'),
  p('hi', 'description', `^कार्य\\s+${Q}\\s+का\\s+विवरण\\s+बदलकर\\s+${Q}\\s+करें${END}`, 'u'),
  p('hi', 'priority', `^कार्य\\s+${Q}\\s+की\\s+प्राथमिकता\\s+(.+?)\\s+करें${END}`, 'u'),
  p('hi', 'state', `^कार्य\\s+${Q}\\s+को\\s+(.+?)\\s+चिह्नित\\s+करें(?:\\s*:\\s*(.*))?$`, 'u'),
  p('pa', 'title', `^ਕੰਮ\\s+${Q}\\s+ਦਾ\\s+ਨਾਮ\\s+ਬਦਲ\\s+ਕੇ\\s+${Q}\\s+ਕਰੋ${END}`, 'u'),
  p('pa', 'description', `^ਕੰਮ\\s+${Q}\\s+ਦਾ\\s+ਵੇਰਵਾ\\s+ਬਦਲ\\s+ਕੇ\\s+${Q}\\s+ਕਰੋ${END}`, 'u'),
  p('pa', 'priority', `^ਕੰਮ\\s+${Q}\\s+ਦੀ\\s+ਤਰਜੀਹ\\s+(.+?)\\s+ਕਰੋ${END}`, 'u'),
  p('pa', 'state', `^ਕੰਮ\\s+${Q}\\s+ਨੂੰ\\s+(.+?)\\s+ਮਾਰਕ\\s+ਕਰੋ(?:\\s*:\\s*(.*))?$`, 'u'),
  p('ar', 'title', `^(?:غيّر|غير)\\s+اسم\\s+المهمة\\s+${Q}\\s+إلى\\s+${Q}${END}`, 'u'),
  p('ar', 'description', `^(?:غيّر|غير)\\s+وصف\\s+المهمة\\s+${Q}\\s+إلى\\s+${Q}${END}`, 'u'),
  p('ar', 'priority', `^اجعل\\s+أولوية\\s+المهمة\\s+${Q}\\s+(.+)$`, 'u'),
  p('ar', 'state', `^اجعل\\s+حالة\\s+المهمة\\s+${Q}\\s+(.+)$`, 'u'),
];

/** A state word, optionally followed by ": <reason>" for Waiting. */
function stateChange(lang: ContentLanguage, raw: string, reasonAfterVerb?: string): CommandResolution {
  let word = raw;
  let reason = reasonAfterVerb;
  if (reason === undefined) {
    const colon = raw.match(/^(.*?)\s*[:：]\s*(.*)$/su);
    if (colon) [word, reason] = [colon[1], colon[2]];
  }
  const state = lookup(lang, STATE_WORDS, word);
  if (!state) return { kind: 'clarify', reason: 'invalid_value' };
  if (reason !== undefined) {
    const text = reason.trim();
    // A reason belongs to Waiting only; an empty one is no reason.
    if (state !== 'waiting' && text) return { kind: 'clarify', reason: 'invalid_value' };
    if (text.length > WAITING_REASON_MAX) return { kind: 'clarify', reason: 'value_too_long' };
    if (text) return { kind: 'edit', lang, target: '', change: { field: 'state', value: state, waiting_reason: text } };
  }
  return { kind: 'edit', lang, target: '', change: { field: 'state', value: state } };
}

function editCommand(line: string): CommandResolution {
  for (const { lang, kind, re } of EDIT_PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    // One change uses exactly its own quotes: the task's title, and a new title or
    // description. More quote marks (a second command run on, or a quote inside a title)
    // cannot be read as one exact change, so the message gets a question (S365-001).
    const quotes = kind === 'title' || kind === 'description' ? 4 : 2;
    if ((line.match(QUOTE_MARK) ?? []).length !== quotes) return { kind: 'clarify', reason: 'multiple_changes' };
    const target = m[1].trim();
    if (!target) return { kind: 'clarify', reason: 'missing_value' };
    let resolved: CommandResolution;
    if (kind === 'title') {
      const value = m[2].trim();
      if (!value) return { kind: 'clarify', reason: 'missing_value' };
      if (value.length > TITLE_MAX) return { kind: 'clarify', reason: 'value_too_long' };
      resolved = { kind: 'edit', lang, target, change: { field: 'title', value } };
    } else if (kind === 'description') {
      const value = m[2].trim();
      if (value.length > DESCRIPTION_MAX) return { kind: 'clarify', reason: 'value_too_long' };
      resolved = { kind: 'edit', lang, target, change: { field: 'description', value } };
    } else if (kind === 'priority') {
      const value = lookup(lang, PRIORITY_WORDS, m[2]);
      if (!value) return { kind: 'clarify', reason: 'invalid_value' };
      resolved = { kind: 'edit', lang, target, change: { field: 'priority', value } };
    } else {
      resolved = stateChange(lang, m[2], m[3]);
      if (resolved.kind !== 'edit') return resolved;
      resolved = { ...resolved, target };
    }
    return resolved;
  }
  return { kind: 'none' };
}

function lineCommand(line: string): CommandResolution {
  const edit = editCommand(line);
  if (edit.kind !== 'none') return edit;
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
  if (lines.length > 1) {
    const edits = lines.some(line => editCommand(line).kind !== 'none');
    return { kind: 'clarify', reason: edits ? 'multiple_changes' : 'multiple' };
  }
  return commands[0];
}

/** How titles are compared for "a task with this title exists" (SQL: companion_title_key). */
export const titleKey = (title: string) => title.trim().replace(/\s+/gu, ' ').toLowerCase();
