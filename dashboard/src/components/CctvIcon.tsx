import React from "react";

/** Custom CCTV camera illustration (gradient, with "add" badge) — used in place of the generic video icon. */
export function CctvIcon({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cctv-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(var(--blue-400))" />
          <stop offset="1" stopColor="rgb(var(--blue-600))" />
        </linearGradient>
        <linearGradient id="cctv-body" x1="14" y1="18" x2="46" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#e6f7f7" />
        </linearGradient>
      </defs>

      {/* tile */}
      <rect width="64" height="64" rx="18" fill="url(#cctv-bg)" />
      <rect x="1" y="1" width="62" height="62" rx="17" stroke="#fff" strokeOpacity=".25" strokeWidth="2" />

      {/* wall mount */}
      <path d="M12 44v8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M12 47h7l5-8" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {/* camera body */}
      <g transform="rotate(-14 32 28)">
        <rect x="15" y="20" width="30" height="15" rx="4.5" fill="url(#cctv-body)" />
        <rect x="15" y="20" width="30" height="4" rx="2" fill="#fff" />
        <path d="M45 23.5l6-2.5v13l-6-2.5z" fill="#fff" fillOpacity=".9" />
        {/* lens */}
        <circle cx="41" cy="27.5" r="3" fill="rgb(var(--blue-600))" />
        <circle cx="41" cy="27.5" r="1.1" fill="#fff" />
        <rect x="19" y="26.5" width="14" height="2" rx="1" fill="rgb(var(--blue-500))" fillOpacity=".35" />
      </g>

      {/* recording dot */}
      <circle cx="20" cy="15" r="2.2" fill="#fff" fillOpacity=".9">
        <animate attributeName="opacity" values="1;.25;1" dur="1.8s" repeatCount="indefinite" />
      </circle>

      {/* add badge */}
      <circle cx="48" cy="48" r="9" fill="#fff" />
      <circle cx="48" cy="48" r="7" fill="rgb(var(--emerald-500))" />
      <path d="M48 44.5v7M44.5 48h7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
