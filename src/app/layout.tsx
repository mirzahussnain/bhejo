import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#10325B",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://bhejo.app"),
  title: "Bhejo: Privacy-First Document Scanning",
  description:
    "Send a secure link. Recipients just point their phone camera to scan, crop, and deliver documents without installing an app.",
  icons: {
    icon: "/favicon.ico",
    apple: "/Bhejo-Icon.png",
  },
  openGraph: {
    title: "Bhejo: Privacy-First Document Scanning",
    description:
      "Send a secure link. Recipients just point their phone camera to scan, crop, and deliver documents without installing an app.",
    url: "https://bhejo.app",
    siteName: "Bhejo",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 675,
        alt: "Bhejo: Scan. Send. Done.",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bhejo: Privacy-First Document Scanning",
    description: "Send a link. Hold the document. Done. Zero app install.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="min-h-full bg-canvas text-canvas-text font-sans selection:bg-brand selection:text-white"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
