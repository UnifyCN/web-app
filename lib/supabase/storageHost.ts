/**
 * The one host the server is allowed to fetch stored images from.
 *
 * Signed URLs come from the `profile-picture-get` edge function, which signs
 * for a single S3 bucket in a single region. The image route still checks every
 * URL it is handed against this exact host before fetching it, so a changed or
 * misbehaving signer can never point the server at another machine (an internal
 * address, a metadata endpoint, someone else's bucket). If the bucket or region
 * ever changes, images fail closed with a logged error until this is updated.
 */
export const STORAGE_HOST =
  "unify-knowledge-documents.s3.us-west-2.amazonaws.com";

/**
 * True only for `https://<STORAGE_HOST>/<key>` on the default port, with no
 * credentials in the URL and a path that is exactly the key that was asked
 * for. Anything else, including a URL that does not parse, is refused.
 */
export function isTrustedStorageUrl(value: string, key: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === STORAGE_HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === `/${key}`
  );
}
