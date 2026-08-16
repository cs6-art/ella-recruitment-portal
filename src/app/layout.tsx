import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "McLink Recruitment Portal",
  description: "Role-first recruitment request and approval portal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <Script id="sidebar-preference" strategy="beforeInteractive">
        {`try { if (window.localStorage.getItem("mclink.sidebar.collapsed") === "true") document.documentElement.dataset.sidebarCollapsed = "true"; } catch (_) {}`}
      </Script>
      <body>{children}</body>
    </html>
  );
}
