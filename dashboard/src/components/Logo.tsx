import React from "react";

interface LogoLandscapeProps {
  height?: number;
  className?: string;
  light?: boolean; // true = white text for dark backgrounds (default), false = slate text for light bg
}

/**
 * MallVision AI — Premium Landscape (Horizontal) Brandmark
 * Combines the high-tech cyber shield aperture emblem with precision typography
 * and an illuminated AI badge in a single crisp, scalable SVG asset.
 */
export function LogoLandscape({
  height = 40,
  className = "",
  light = true,
}: LogoLandscapeProps) {
  const id = React.useId().replace(/:/g, "");
  // Aspect ratio ~208:44 -> width is ~ 4.72 * height
  const width = Math.round((208 / 44) * height);

  const textPrimary = light ? "#FFFFFF" : "#0F172A";
  const textSub = light ? "rgba(255, 255, 255, 0.78)" : "rgba(15, 23, 42, 0.6)";
  const badgeBg = light ? "rgba(56, 189, 248, 0.16)" : "rgba(2, 132, 199, 0.12)";
  const badgeBorder = light ? "rgba(56, 189, 248, 0.5)" : "rgba(2, 132, 199, 0.35)";
  const badgeText = light ? "#38BDF8" : "#0284C7";

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 208 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="MallVision AI Landscape Logo"
    >
      <defs>
        {/* Shield Prism Gradient */}
        <linearGradient id={`ls-shield-${id}`} x1="4" y1="2" x2="38" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>

        {/* Vision Typography Gradient */}
        <linearGradient id={`ls-vis-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>

        {/* Optical Laser Scan Beam */}
        <linearGradient id={`ls-scan-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0" />
          <stop offset="50%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </linearGradient>

        {/* Subtle Shield Bezel Glint */}
        <linearGradient id={`ls-glint-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ================= LEFT EMBLEM: CYBER SHIELD & OPTIC LENS ================= */}
      <g transform="translate(1, 0)">
        {/* Shield Outer Body */}
        <path
          d="M20 2.5 L36 8 V21 C36 30.5 29.2 37.2 20 40.5 C10.8 37.2 4 30.5 4 21 V8 L20 2.5 Z"
          fill={`url(#ls-shield-${id})`}
        />
        {/* Shield Bezel Highlight */}
        <path
          d="M20 3 L35 8.2 V21 C35 30 28.5 36.3 20 39.5 C11.5 36.3 5 30 5 21 V8.2 L20 3 Z"
          fill="none"
          stroke={`url(#ls-glint-${id})`}
          strokeWidth="1"
        />

        {/* Inner Aperture / Eye Background */}
        <path
          d="M9 20 C12.5 14.5 16 12 20 12 C24 12 27.5 14.5 31 20 C27.5 25.5 24 28 20 28 C16 28 12.5 25.5 9 20 Z"
          fill="#0B132B"
        />

        {/* Lens Aperture Ring */}
        <circle cx="20" cy="20" r="5.2" fill="none" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.9" />

        {/* Center Vision Core */}
        <circle cx="20" cy="20" r="2.8" fill={`url(#ls-shield-${id})`} />
        <circle cx="21.3" cy="18.7" r="0.9" fill="#FFFFFF" />

        {/* Precision Laser Scanline */}
        <rect x="8" y="19.5" width="24" height="1" rx="0.5" fill={`url(#ls-scan-${id})`} />

        {/* Micro Telemetry Bars */}
        <rect x="15" y="30.5" width="2.2" height="3.5" rx="0.6" fill="#FFFFFF" fillOpacity="0.75" />
        <rect x="18.8" y="28.5" width="2.2" height="5.5" rx="0.6" fill="#FFFFFF" fillOpacity="0.9" />
        <rect x="22.6" y="26.5" width="2.2" height="7.5" rx="0.6" fill="#FFFFFF" />
      </g>

      {/* ================= RIGHT TYPOGRAPHY & BRANDMARK ================= */}
      {/* Primary Brand Line: MALLVISION + AI Badge */}
      <g>
        <text
          x="44"
          y="22.5"
          fontFamily="'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontSize="17.5"
          fontWeight="900"
          letterSpacing="0.04em"
        >
          <tspan fill={textPrimary}>MALL</tspan>
          <tspan fill={`url(#ls-vis-${id})`}>VISION</tspan>
        </text>

        {/* AI Cyber Chip Pill */}
        <g transform="translate(158, 8)">
          <rect
            x="0"
            y="0"
            width="34"
            height="16.5"
            rx="4"
            fill={badgeBg}
            stroke={badgeBorder}
            strokeWidth="1"
          />
          {/* Active Status Pulse Dot */}
          <circle cx="7" cy="8.2" r="2" fill={badgeText} />
          <text
            x="13"
            y="11.8"
            fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif"
            fontSize="9.5"
            fontWeight="900"
            fill={badgeText}
            letterSpacing="0.08em"
          >
            AI
          </text>
        </g>
      </g>

      {/* Secondary Tech Line: Live Indicator + Subtitle */}
      <g transform="translate(45, 30.5)">
        {/* Real-time Green Live Dot */}
        <circle cx="2.5" cy="4" r="1.6" fill="#10B981" />
        <circle cx="2.5" cy="4" r="3.2" fill="#10B981" fillOpacity="0.25" />
        
        <text
          x="9.5"
          y="6.8"
          fontFamily="'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontSize="7.8"
          fontWeight="700"
          fill={textSub}
          letterSpacing="0.18em"
        >
          LOCAL CCTV ANALYTICS
        </text>
      </g>
    </svg>
  );
}

/**
 * MallVision AI mark — standalone square icon / shield (useful for avatars, loading spinners, app icons)
 */
export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="MallVision AI logo">
      <defs>
        <linearGradient id={`mvg-${id}`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6BE3E5" />
          <stop offset="0.55" stopColor="#51CBCE" />
          <stop offset="1" stopColor="#2F8FB8" />
        </linearGradient>
        <linearGradient id={`mvs-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FBC658" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FBC658" />
          <stop offset="1" stopColor="#FBC658" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Shield */}
      <path d="M32 3.5 54 11v18.6c0 13.6-9.1 24.6-22 30.9C19.1 54.2 10 43.2 10 29.6V11L32 3.5Z" fill={`url(#mvg-${id})`} />
      <path d="M32 3.5 54 11v18.6c0 13.6-9.1 24.6-22 30.9" fill="none" stroke="#ffffff" strokeOpacity=".25" strokeWidth="1.2" />
      {/* Eye / lens */}
      <path d="M15.5 27.5C19.6 20.8 25.4 17.5 32 17.5s12.4 3.3 16.5 10c-4.1 6.7-9.9 10-16.5 10s-12.4-3.3-16.5-10Z" fill="#fff" />
      <circle cx="32" cy="27.5" r="7" fill="#1E2A33" />
      <circle cx="32" cy="27.5" r="3.4" fill={`url(#mvg-${id})`} />
      <circle cx="34.4" cy="25.1" r="1.4" fill="#fff" />
      {/* Scan line */}
      <rect x="13" y="27" width="38" height="1.1" rx=".55" fill={`url(#mvs-${id})`} />
      {/* Count bars */}
      <rect x="24.5" y="44" width="3.6" height="5" rx="1" fill="#fff" fillOpacity=".75" />
      <rect x="30.2" y="41" width="3.6" height="8" rx="1" fill="#fff" fillOpacity=".9" />
      <rect x="35.9" y="38" width="3.6" height="11" rx="1" fill="#fff" />
    </svg>
  );
}

/**
 * Standard Logo component — now defaults to the sleek landscape lockup
 */
export function Logo({
  size = 40,
  light = true,
  tagline = true,
  className = "",
}: {
  size?: number;
  light?: boolean;
  tagline?: boolean;
  className?: string;
}) {
  return <LogoLandscape height={size} light={light} className={className} />;
}
