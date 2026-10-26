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
