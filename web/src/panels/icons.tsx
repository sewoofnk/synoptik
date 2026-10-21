// Jednoduché čiarové ikony 24×24 (vlastné, bez knižnice). Farba = currentColor.

const PATHS = {
  thermometer: "M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z",
  wind: "M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2",
  gust: "M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h6M3 20h3",
  gauge: "M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0",
  droplet: "M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z",
  humidity: "M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0zM9 16l6-6M9.5 10.5h.01M14.5 15.5h.01",
  cloud: "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "M18 6 6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  locate: "M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  login: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  isolines: "M2 7c3-3 6-3 9 0s6 3 11 0M2 13c3-3 6-3 9 0s6 3 11 0M2 19c3-3 6-3 9 0s6 3 11 0",
  particles: "M3 7h5M12 7h9M2 12h3M9 12h8M4 17h9M17 17h3",
  ruler: "M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  play: "M7 4v16l13-8z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  prev: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
} as const;

export type IconName = keyof typeof PATHS;

const FILLED: ReadonlySet<IconName> = new Set(["play", "pause"]);

interface Props {
  name: IconName;
  size?: number;
  /** Krátky text v pravom dolnom rohu (napr. N/S/V pri oblačnosti) */
  badge?: string;
}

export function Icon({ name, size = 20, badge }: Props) {
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
      {badge && (
        <text x="23" y="23" text-anchor="end" font-size="10" font-weight="700" fill="currentColor" stroke="none">
          {badge}
        </text>
      )}
    </svg>
  );
}
