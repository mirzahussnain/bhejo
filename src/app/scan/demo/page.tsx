import type { Metadata } from "next";
import { CameraScanner } from "@/components/scanner/CameraScanner";

export const metadata: Metadata = {
  title: "Scan a document | Bhejo",
};

export default function ScanDemoPage() {
  return <CameraScanner />;
}
