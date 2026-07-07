import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Prometheon Engine",
  description: "Professional stock research platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ display: "flex", width: "100%", height: "100%", background: "var(--bg-primary)", margin: 0, overflow: "hidden" }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "2rem 2.5rem" }} className="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
