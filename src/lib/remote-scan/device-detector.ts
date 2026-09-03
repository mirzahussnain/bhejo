import type { ConnectedDeviceInfo } from "../../types/remote-scan.ts";

/**
 * Pure, privacy-preserving device metadata parser.
 * Extracts high-level non-invasive device category, browser, and OS from standard User-Agent.
 * NEVER uses intrusive fingerprinting (canvas, audio, hardware concurrency, webgl, etc.).
 */

export function maskIpAddress(ip?: string | null): string {
  if (!ip || ip.trim().length === 0) {
    return "Unknown";
  }

  const clean = ip.trim();

  // If x-forwarded-for contains multiple IPs, take the first client IP
  const firstIp = clean.split(",")[0].trim();

  // Handle IPv4
  if (firstIp.includes(".")) {
    const parts = firstIp.split(".");
    if (parts.length === 4) {
      // e.g. 82.165.20.1 -> 82.xxx.xxx.xxx
      return `${parts[0]}.xxx.xxx.xxx`;
    }
  }

  // Handle IPv6
  if (firstIp.includes(":")) {
    const parts = firstIp.split(":");
    if (parts.length > 1) {
      // e.g. 2001:db8:... -> 2001:xxxx:xxxx:...
      return `${parts[0]}:xxxx:xxxx:xxxx`;
    }
  }

  return "xxx.xxx.xxx.xxx";
}

export function parseDeviceMetadata(
  userAgent?: string | null,
  rawIp?: string | null,
  now: number = Date.now(),
): ConnectedDeviceInfo {
  const ua = userAgent || "";

  let deviceFamily = "Unknown";
  let browser = "Browser";
  let os = "Unknown OS";

  // 1. Detect Device Family & OS
  if (/iPhone/i.test(ua)) {
    deviceFamily = "iPhone";
    const osMatch = ua.match(/OS (\d+[_\.]\d+)/i);
    os = osMatch ? `iOS ${osMatch[1].replace("_", ".")}` : "iOS";
  } else if (/iPad/i.test(ua)) {
    deviceFamily = "iPad";
    const osMatch = ua.match(/OS (\d+[_\.]\d+)/i);
    os = osMatch ? `iPadOS ${osMatch[1].replace("_", ".")}` : "iPadOS";
  } else if (/Android/i.test(ua)) {
    deviceFamily = "Android";
    const osMatch = ua.match(/Android\s+([0-9\.]+)/i);
    os = osMatch ? `Android ${osMatch[1]}` : "Android";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    deviceFamily = "Mac";
    os = "macOS";
  } else if (/Windows NT/i.test(ua)) {
    deviceFamily = "Windows";
    if (/Windows NT 10\.0/i.test(ua)) {
      os = "Windows 10/11";
    } else {
      os = "Windows";
    }
  } else if (/Linux/i.test(ua)) {
    deviceFamily = "Linux";
    os = "Linux";
  }

  // 2. Detect Browser (Order matters because Chrome ua contains Safari, Edge ua contains Chrome)
  if (/Edg\//i.test(ua)) {
    browser = "Edge";
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = "Opera";
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = "Samsung Internet";
  } else if (/Chrome|CriOS/i.test(ua)) {
    browser = "Chrome";
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = "Firefox";
  } else if (/Safari/i.test(ua)) {
    browser = "Safari";
  }

  // 3. User-Agent-Derived Display Name
  const displayName = deviceFamily !== "Unknown" ? `${deviceFamily} · ${browser}` : browser;
  const ipAddress = maskIpAddress(rawIp);

  return {
    deviceFamily,
    browser,
    os,
    displayName,
    ipAddress,
    connectedAt: now,
    lastActivityAt: now,
  };
}
