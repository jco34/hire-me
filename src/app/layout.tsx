import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "hire me",
  description:
    "A local-first tracker for job applications. Stage and outcome as two axes, a dated event log on every application, and a mark when a record goes quiet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
