export function FlowMateLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" className="fill-primary" />
      <path
        d="M7 16.5V9.2C7 8 7.9 7 9.2 7h4.9M7 12h4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="text-primary-foreground"
      />
      <circle cx="17.2" cy="16.5" r="2.1" className="fill-primary-foreground" />
    </svg>
  );
}
