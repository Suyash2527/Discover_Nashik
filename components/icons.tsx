"use client";

/**
 * Shared category icons — used in chips, map pins AND the details sheet.
 * All icons are 24×24 viewBox, stroke-based, with white strokes on coloured bg.
 */

import { type SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number): SVGProps<SVGSVGElement> => ({
  xmlns: "http://www.w3.org/2000/svg",
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function TempleIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Shikhara / temple tower silhouette */}
      <path d="M12 2 L10 7 H14 Z" />
      <rect x="9" y="7" width="6" height="2" rx="0.5" />
      <path d="M8 9 L7 14 H17 L16 9" />
      <rect x="6" y="14" width="12" height="2" rx="0.5" />
      <path d="M5 16 H19 V18 H5 Z" />
      <rect x="10" y="18" width="4" height="4" />
    </svg>
  );
}

export function GhatIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Water steps */}
      <path d="M3 18 H21" />
      <path d="M5 15 H19" />
      <path d="M7 12 H17" />
      <path d="M2 20 C5 18.5 8 20.5 11 19.5 S17 18 22 20" strokeWidth={1.5} />
    </svg>
  );
}

export function FoodIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Plate with fork and spoon */}
      <circle cx="12" cy="13" r="5" />
      <path d="M5 8 V4 M5 8 C5 10.5 7 12 7 12" />
      <path d="M7 4 V8" />
      <path d="M19 4 V20 M19 4 C17 6 17 10 19 12" />
    </svg>
  );
}

export function StayIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Bed */}
      <path d="M2 20 V14 C2 12.9 2.9 12 4 12 H20 C21.1 12 22 12.9 22 14 V20" />
      <path d="M2 20 H22" />
      <path d="M2 14 H22" />
      <rect x="3" y="8" width="5" height="4" rx="1" />
      <path d="M2 8 V6 C2 4.9 2.9 4 4 4 H20 C21.1 4 22 4.9 22 6 V14" />
    </svg>
  );
}

export function ParkingIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* P in a square */}
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9 7 H13.5 C15.4 7 17 8.6 17 10.5 C17 12.4 15.4 14 13.5 14 H9 V7 Z" />
      <line x1="9" y1="14" x2="9" y2="18" />
    </svg>
  );
}

export function TransportIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Bus front */}
      <rect x="5" y="3" width="14" height="15" rx="2.5" />
      <line x1="5" y1="11" x2="19" y2="11" />
      <circle cx="8.5" cy="14.5" r="0.6" />
      <circle cx="15.5" cy="14.5" r="0.6" />
      <line x1="7.5" y1="18" x2="7.5" y2="21" />
      <line x1="16.5" y1="18" x2="16.5" y2="21" />
    </svg>
  );
}

export function HospitalIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Cross / plus */}
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 7 V17 M7 12 H17" strokeWidth={2.5} />
    </svg>
  );
}

export function PoliceIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Shield / badge */}
      <path d="M12 2 L20 6 V13 C20 17.4 16.4 21.2 12 22 C7.6 21.2 4 17.4 4 13 V6 Z" />
      <path d="M9 12 L11 14 L15 10" strokeWidth={2} />
    </svg>
  );
}

export function ToiletIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Male/Female symbols side by side */}
      <circle cx="8" cy="5" r="2" />
      <path d="M8 7 V14 M6 10 H10" />
      <circle cx="16" cy="5" r="2" />
      <path d="M16 7 V14" />
      <path d="M14 9 H18 V12 H16 V17" />
    </svg>
  );
}

export function WaterIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Water drop */}
      <path d="M12 2 C12 2 5 10 5 15 C5 18.9 8.1 22 12 22 C15.9 22 19 18.9 19 15 C19 10 12 2 12 2 Z" />
    </svg>
  );
}

export function ChemistIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Capsule / pill */}
      <rect x="3" y="9" width="18" height="6" rx="3" />
      <line x1="12" y1="9" x2="12" y2="15" />
    </svg>
  );
}

// ─── Generic icons used across UI ────────────────────────────────────────────

export function MicIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10 C5 14.4 8.1 18 12 18 C15.9 18 19 14.4 19 10" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function MicOffIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10 C5 14.4 8.1 18 12 18 C15.9 18 19 14.4 19 10" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
      <line x1="2" y1="2" x2="22" y2="22" strokeWidth={2} />
    </svg>
  );
}

export function SearchIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21 L16.65 16.65" />
    </svg>
  );
}

export function NavigationIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}

export function PhoneIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M22 16.92 V19.92 C22 20.48 21.52 21 20.96 21 C10.2 21 1.5 12.3 1.5 1.54 C1.5 0.98 2 0.5 2.56 0.5 H5.56 C6.08 0.5 6.5 0.86 6.56 1.38 C6.78 3.22 7.34 4.92 8.2 6.42 C8.48 6.92 8.34 7.54 7.88 7.86 L6.26 8.94 C7.76 12.44 10.56 15.24 14.06 16.74 L15.14 15.12 C15.46 14.66 16.08 14.52 16.58 14.8 C18.08 15.66 19.78 16.22 21.62 16.44 C22.14 16.5 22.5 16.9 22.5 17.42" />
    </svg>
  );
}

export function MapPinIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M21 10 C21 17 12 23 12 23 S3 17 3 10 C3 5 7.03 1 12 1 S21 5 21 10 Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function SpeakerIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46 C16.79 9.71 17.5 11.31 17.5 13 C17.5 14.69 16.79 16.29 15.54 17.54" />
      <path d="M19.07 4.93 C21.2 7.06 22.5 9.93 22.5 13 C22.5 16.07 21.2 18.94 19.07 21.07" />
    </svg>
  );
}

export function XIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function AlertCircleIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function RotateCcwIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M1 4 V10 H7" />
      <path d="M3.51 15 C4.73 18.61 8.11 21.2 12.09 21 C16.78 20.72 20.6 16.84 20.99 12.15 C21.4 7.08 17.39 2.77 12.38 2.51 C8.5 2.3 5.07 4.5 3.5 7.8" />
    </svg>
  );
}

export function LocateIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export function WalkIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="13" cy="4" r="2" />
      <path d="M9 21 L11 15 L14 17 V22" />
      <path d="M7 12 L9.5 8.5 L13.5 8 L16 11.5 L19 12.5" />
      <path d="M13.5 8 L11 15" />
    </svg>
  );
}

export function CarIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M5 17 H3 V12 L5.5 6.5 H18.5 L21 12 V17 H19" />
      <path d="M3 12 H21" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 17 H15" />
    </svg>
  );
}

/** Solid arrow pointing up (north); rotate it with CSS. */
export function ArrowUpIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="currentColor" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M15 18 L9 12 L15 6" />
    </svg>
  );
}

export function ListIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 6 H21 M8 12 H21 M8 18 H21" />
      <circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
    </svg>
  );
}

/** Returns the icon component for any category */
export function CategoryIcon({ category, size = 24 }: { category: string; size?: number }) {
  const props = { size };
  switch (category) {
    case "temple":   return <TempleIcon {...props} />;
    case "ghat":     return <GhatIcon {...props} />;
    case "food":     return <FoodIcon {...props} />;
    case "stay":     return <StayIcon {...props} />;
    case "parking":  return <ParkingIcon {...props} />;
    case "transport": return <TransportIcon {...props} />;
    case "hospital": return <HospitalIcon {...props} />;
    case "police":   return <PoliceIcon {...props} />;
    case "toilet":   return <ToiletIcon {...props} />;
    case "water":    return <WaterIcon {...props} />;
    case "chemist":  return <ChemistIcon {...props} />;
    default:         return <MapPinIcon {...props} />;
  }
}

/** Returns the hex color for a category */
export function categoryColor(category: string): string {
  const map: Record<string, string> = {
    // Earth pigments — distinguishable on a map, quiet next to the paper UI.
    temple:   "#B4471B", // sindoor
    ghat:     "#1F5B78", // Godavari
    food:     "#9A7414", // haldi, darkened for white icons
    stay:     "#5E4B7C",
    parking:  "#5A6068",
    transport: "#2F62C4", // bus blue — distinct from temple sindoor
    hospital: "#2F6B45",
    police:   "#2B3D6E",
    toilet:   "#3E7370",
    water:    "#3B7EA1",
    chemist:  "#8E3A5C",
  };
  return map[category] ?? "#5A6068";
}
