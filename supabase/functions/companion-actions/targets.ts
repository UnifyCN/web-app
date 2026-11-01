// The account's live Checklist tasks by title (mobile-app#365), so a clear edit command can
// name its task and an edit draft can be checked against the account's own Checklist. It
// reuses the Companion context read (#362): the caller's JWT (row-level security) for
// progress and custom tasks, and the published task content the Checklist shows for the
// profile's persona, stage and province, in the given language. Reads only.
import {
  createUserScopedClient,
  readChecklist,
  readProfileRow,
  type SanityConfig,
} from '../rag-query/lib/context/appContext.ts';

export interface TaskTarget {
  task_ref: string;
  title: string;
}

export interface TaskList {
  /** False when published tasks may exist but could not be read: no title is certain. */
  complete: boolean;
  tasks: TaskTarget[];
}

/** Live tasks of the account the JWT belongs to. Rejects when the read fails. */
export type ListTasks = (jwt: string, userId: string, lang: string) => Promise<TaskList>;

const READ_TIMEOUT_MS = 8_000;

export function createTaskLister(config: {
  supabaseUrl: string;
  anonKey: string;
  sanity: SanityConfig | null;
}): ListTasks {
  return async (jwt, userId, lang) => {
    const client = createUserScopedClient(config.supabaseUrl, config.anonKey, `Bearer ${jwt}`);
    const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
    const profile = await readProfileRow(client, userId, signal);
    const read = await readChecklist(
      client,
      userId,
      profile,
      { sanity: config.sanity, lang, prompt: '', limit: Number.POSITIVE_INFINITY },
      signal,
    );
    return {
      complete: read.complete,
      tasks: read.items.flatMap(item => (item.title ? [{ task_ref: item.id, title: item.title }] : [])),
    };
  };
}
