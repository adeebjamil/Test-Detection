import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MallVision AI — Local CCTV Analytics Dashboard",
  description: "Lightweight, offline CCTV entrance analytics for malls: people, demographics and pet counts from local AI.",
};

// Applies the saved (or system) theme before first paint to avoid a light/dark flash.
const themeScript = `(function(){try{var t=localStorage.getItem('mv-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning className="antialiased min-h-screen bg-page text-slate-900">{children}</body>
    </html>
  );
}
