import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bhejo",
  description: "Privacy-first link-based document scanning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
