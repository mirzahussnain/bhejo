export interface NavLink {
  readonly label: string;
  readonly href: string;
}

export interface HeroData {
  readonly badge: string;
  readonly title: string;
  readonly description: string;
  readonly primaryCta: {
    readonly label: string;
    readonly href: string;
  };
  readonly secondaryCta: {
    readonly label: string;
    readonly href: string;
  };
  readonly compatibility: readonly string[];
}

export interface HowItWorksStep {
  readonly stepNumber: string;
  readonly title: string;
  readonly summary: string;
  readonly detail: string;
  readonly tag: string;
}

export interface FeatureBentoItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly colSpan: "1" | "2";
  readonly category: string;
}

export interface PrivacySpecRow {
  readonly capability: string;
  readonly bhejo: string;
  readonly traditional: string;
}

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface FooterLinkColumn {
  readonly title: string;
  readonly links: readonly { readonly label: string; readonly href: string }[];
}

export const NAV_LINKS: readonly NavLink[] = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Privacy", href: "#privacy" },
  { label: "FAQ", href: "#faq" },
] as const;

export const HERO_DATA: HeroData = {
  badge: "Zero App Install • 100% Client-Side",
  title: "Request Documents from Anyone. No App Needed.",
  // Exactly 17 words (under the strict 20-word cap):
  description:
    "Send a secure link. Recipients just point their phone camera to scan, crop, and deliver automatically.",
  primaryCta: {
    label: "Try Free",
    href: "/signup",
  },
  secondaryCta: {
    label: "Try Live Scanner",
    href: "/scan/demo",
  },
  compatibility: [
    "WhatsApp Web & Mobile",
    "Safari iOS",
    "Chrome Android",
    "Zero Account Required",
  ],
} as const;

export const HOW_IT_WORKS_STEPS: readonly HowItWorksStep[] = [
  {
    stepNumber: "01",
    title: "Generate a Secure Scan Request",
    summary: "Set required documents and an optional PIN code in seconds.",
    detail:
      "Choose expiration window, specify page count or document names, and generate an unguessable private link.",
    tag: "Sender Flow",
  },
  {
    stepNumber: "02",
    title: "Share the Link Over Any Channel",
    summary: "Deliver via WhatsApp, SMS, or email with one click.",
    detail:
      "The recipient taps the link directly on their mobile browser. No App Store download, no registration, no confusion.",
    tag: "Instant Delivery",
  },
  {
    stepNumber: "03",
    title: "Recipient Holds Phone Over Document",
    summary: "Automatic edge detection, stability check, and instant capture.",
    detail:
      "WebAssembly runs OpenCV right on the device. When aligned and steady, Bhejo auto-snaps, crops, and sends clean scans.",
    tag: "Zero Effort",
  },
] as const;

export const FEATURE_BENTO_ITEMS: readonly FeatureBentoItem[] = [
  {
    id: "edge-detection",
    title: "Real-time edge detection in mobile browsers",
    subtitle:
      "Lightweight WebAssembly processes video frames locally at 10 frames per second, locking onto four corners with sub-pixel precision.",
    colSpan: "2",
    category: "Computer Vision",
  },
  {
    id: "zero-friction",
    title: "Zero downloads, zero recipient friction",
    subtitle:
      "Designed specifically for non-technical users and elderly relatives who struggle with complex scanner apps.",
    colSpan: "1",
    category: "Accessibility",
  },
  {
    id: "multi-page",
    title: "Multi-page batch scanning in one session",
    subtitle:
      "Recipients can scan up to 20 pages consecutively. Bhejo bundles and delivers them as a unified high-resolution document.",
    colSpan: "1",
    category: "Productivity",
  },
  {
    id: "local-privacy",
    title: "100% on-device memory. Never streamed.",
    subtitle:
      "Live camera feeds never touch a remote server. Only the final confirmed capture is encrypted and delivered to your inbox.",
    colSpan: "2",
    category: "Architecture",
  },
] as const;

export const PRIVACY_SPECS: readonly PrivacySpecRow[] = [
  {
    capability: "Live Camera Stream",
    bhejo: "Remains in local device RAM only. Never uploaded.",
    traditional: "Frequently streamed to remote servers for server-side processing.",
  },
  {
    capability: "Document Processing",
    bhejo: "Runs locally using compiled WebAssembly and Web Workers.",
    traditional: "Transferred to third-party cloud vision services.",
  },
  {
    capability: "Recipient Account",
    bhejo: "Never required. Open link and scan immediately.",
    traditional: "Mandatory app installation and account signup.",
  },
  {
    capability: "Link Expiration",
    bhejo: "Automatic TTL expiration with single-use session tokens.",
    traditional: "Permanent public storage links without expiration.",
  },
  {
    capability: "Third-Party AI Tracking",
    bhejo: "Strict zero-AI scanner engine. Zero LLM data harvesting.",
    traditional: "Unvetted model training on uploaded sensitive documents.",
  },
] as const;

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Do recipients need to install any app or extension?",
    answer:
      "No. Recipients simply tap the link in WhatsApp, SMS, or email. The scanner runs directly inside mobile Chrome or Safari.",
  },
  {
    question: "Does Bhejo upload live camera video to servers?",
    answer:
      "Never. All edge detection, stability tracking, perspective correction, and cropping run entirely on the recipient's phone using local WebAssembly. Only the final confirmed scan is uploaded.",
  },
  {
    question: "What happens if a recipient has shaky hands or low lighting?",
    answer:
      "Bhejo includes an intelligent stability engine that guides the recipient with clear visual cues and only auto-captures when the document is steady and well lit. Manual capture is always available as a fallback.",
  },
  {
    question: "Can multiple pages be scanned in a single session?",
    answer:
      "Yes. Senders can specify the expected document count, and recipients can scan multiple pages seamlessly before completing the session.",
  },
  {
    question: "How long do scan links remain active?",
    answer:
      "Senders choose link expiration windows from 1 hour to 7 days. Once expired or completed, the session cannot be reopened.",
  },
] as const;

export const FOOTER_COLUMNS: readonly FooterLinkColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Interactive Scanner", href: "/scan/demo" },
      { label: "Sender Dashboard", href: "/dashboard" },
      { label: "Create Request", href: "/dashboard" },
      { label: "Sign In", href: "/login" },
    ],
  },
  {
    title: "Technology",
    links: [
      { label: "OpenCV WebAssembly", href: "#features" },
      { label: "Zero-Knowledge Architecture", href: "#privacy" },
      { label: "Browser Compatibility", href: "#how-it-works" },
      { label: "Security Whitepaper", href: "#privacy" },
    ],
  },
  {
    title: "Legal & Trust",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Data Retention Policy", href: "#" },
      { label: "System Status", href: "#" },
    ],
  },
] as const;
