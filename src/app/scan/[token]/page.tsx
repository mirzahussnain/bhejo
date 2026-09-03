import type { Metadata } from "next";
import { RemoteScannerContainer } from "@/components/remote-scan/RemoteScannerContainer";

interface ScanTokenPageProps {
  readonly params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Scan Document | Bhejo",
  description: "Secure, private document scanning without an app.",
};

export default async function ScanTokenPage({ params }: ScanTokenPageProps) {
  const { token } = await params;
  return <RemoteScannerContainer publicToken={token} />;
}
