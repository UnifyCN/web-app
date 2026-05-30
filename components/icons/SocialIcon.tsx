// Ported 1:1 from mobile app components/icons/SocialIcon.tsx (react-native-svg).
// Uses currentColor so the sidebar's active/inactive text colors flow through.
export function SocialIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.5 2C1.11929 2 0 3.11929 0 4.5V15.5C0 16.8807 1.11929 18 2.5 18H17.5C18.8807 18 20 16.8807 20 15.5V4.5C20 3.11929 18.8807 2 17.5 2H2.5ZM2 4.5C2 4.22386 2.22386 4 2.5 4H17.5C17.7761 4 18 4.22386 18 4.5V15.5C18 15.7761 17.7761 16 17.5 16H2.5C2.22386 16 2 15.7761 2 15.5V4.5Z"
        fill="currentColor"
      />
      <rect x="3" y="5" width="14" height="4" rx="0.6" fill="currentColor" />
      <rect x="3" y="10.5" width="14" height="1.4" rx="0.7" fill="currentColor" />
      <rect x="3" y="13" width="9" height="1.4" rx="0.7" fill="currentColor" />
    </svg>
  );
}
