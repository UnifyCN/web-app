// Only the published learning sections linked by the marketing search CTAs.
// No arbitrary `next` URLs, query strings, or external destinations are accepted.
const DESTINATIONS = new Set([
  "/learn/9717e260-bdeb-4ee4-8d39-4159a48eb627/3d5abe49-8616-48f8-a857-b80317ddeb35",
  "/learn/4c79ebb5-b03a-47aa-862e-6d0853eba7d4/b7988f8b-6105-4a26-ade1-6df5864f8ee6",
  "/learn/1f43061d-0062-4ea5-bd82-6b25e8ee5a55/9882f55c-6191-4c4f-85f3-8cf4e1873355",
]);

export const LEARNING_DESTINATION_COOKIE = "unify_learning_destination";
export const LEARNING_DESTINATION_TTL_SECONDS = 30 * 60;

export function allowedLearningDestination(path: string): string | null {
  return DESTINATIONS.has(path) ? path : null;
}

export function encodeLearningDestination(path: string, now = Date.now()): string {
  return `${now + LEARNING_DESTINATION_TTL_SECONDS * 1000}|${path}`;
}

export function readLearningDestination(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const [expiry, path, extra] = value.split("|");
  const expiresAt = Number(expiry);
  if (
    extra !== undefined || !path || !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now || expiresAt > now + LEARNING_DESTINATION_TTL_SECONDS * 1000
  ) return null;
  return allowedLearningDestination(path);
}
