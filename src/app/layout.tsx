import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "McLink Recruitment Portal",
  description: "Role-first recruitment request and approval portal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
