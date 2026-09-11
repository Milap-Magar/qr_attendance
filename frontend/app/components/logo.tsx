import { BRAND } from "~/lib/brand";
import { cn } from "~/lib/utils";

// The Hajir mark: a QR code whose fourth corner is a check mark.
// Three finder squares say "QR", the tick where the fourth one would be says "present".
// Keep it in sync with public/favicon.svg.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id="hajir-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#hajir-bg)" />
      <g fill="none" stroke="#fff" strokeWidth="2">
        <rect x="6" y="6" width="9" height="9" rx="2.5" />
        <rect x="17" y="6" width="9" height="9" rx="2.5" />
        <rect x="6" y="17" width="9" height="9" rx="2.5" />
      </g>
      <g fill="#fff">
        <rect x="9" y="9" width="3" height="3" rx="1" />
        <rect x="20" y="9" width="3" height="3" rx="1" />
        <rect x="9" y="20" width="3" height="3" rx="1" />
      </g>
      <path d="M17.8 21.6l2.9 2.9 5.5-6" fill="none" stroke="#a3e635" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// mark + wordmark, e.g. in the auth pages and the landing page header
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-lg font-semibold tracking-tight", className)}>
      <LogoMark className={markClassName} />
      {BRAND.name}
    </span>
  );
}
