import React from "react";
import Image from "next/image";

interface BhejoLogoProps {
  readonly className?: string;
  readonly size?: number;
  readonly priority?: boolean;
}

/**
 * Official Bhejo brand symbol vector component.
 * Uses the authentic bhejo-symbol.svg asset directly with transparent cutouts.
 */
export function BhejoLogo({
  className = "",
  size = 36,
  priority = false,
}: BhejoLogoProps) {
  const height = Math.round(size * (1549.31 / 1273.46));

  return (
    <Image
      src="/bhejo-symbol.svg"
      alt="Bhejo Logo"
      width={size}
      height={height}
      priority={priority}
      unoptimized
      className={`inline-block shrink-0 object-contain transition-transform duration-300 ${className}`}
    />
  );
}
