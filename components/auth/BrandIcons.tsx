/**
 * Brand SSO glyphs. lucide-react ships no brand marks, so these are inline SVGs
 * shared by the login + signup screens (extracted from the original login page).
 */

/** Multi-colour Google "G". */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M12 5.04c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.74 1.62 15.13.5 12 .5 7.36.5 3.36 3.16 1.42 7.04l3.84 2.98C6.18 7.3 8.86 5.04 12 5.04z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45c-.28 1.5-1.12 2.77-2.39 3.62l3.7 2.87c2.16-2 3.4-4.94 3.4-8.68z"
      />
      <path
        fill="#FBBC05"
        d="M5.26 14.32a7.2 7.2 0 0 1 0-4.6L1.42 6.74a12 12 0 0 0 0 10.5l3.84-2.92z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.24 0 5.96-1.07 7.95-2.9l-3.7-2.87c-1.03.69-2.35 1.1-4.25 1.1-3.14 0-5.82-2.26-6.74-5.31L1.42 16.5C3.36 20.84 7.36 23.5 12 23.5z"
      />
    </svg>
  );
}

/** Apple logo — inherits the surrounding text colour via `currentColor`. */
export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.26 3.04-.84.84-1.9 1.32-3.04 1.23-.13-1.1.42-2.27 1.2-3.04C14.05.94 15.27.45 16.36.43c.02.33.01.66.01 1zM20.5 17.1c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.53-4.12 3.54-1.54.02-1.94-1-4.03-.99-2.09.01-2.53 1.01-4.07.99-1.73-.02-3.05-1.79-4.04-3.36C.36 16.5-.13 11.43 1.6 8.85c1.23-1.83 3.17-2.9 5-2.9 1.86 0 3.03 1.02 4.57 1.02 1.49 0 2.4-1.02 4.55-1.02 1.63 0 3.36.89 4.59 2.42-4.03 2.21-3.37 7.96.59 9.73z" />
    </svg>
  );
}
