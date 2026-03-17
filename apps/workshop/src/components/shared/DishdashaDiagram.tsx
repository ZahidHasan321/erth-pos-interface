import type { Measurement } from "@repo/database";

// ── SVG viewBox (matches cropped dishdasha.svg) ─────────────────
const VB = "85 15 622 1102";

// ── Measurement value positions in SVG viewBox coordinates ──────
const VALUE_POSITIONS: { key: keyof Measurement; x: number; y: number }[] = [
  { key: "collar_width", x: 399, y: 27 },
  { key: "collar_height", x: 279, y: 50 },
  { key: "length_front", x: 335, y: 298 },
  { key: "length_back", x: 462, y: 297 },
  { key: "shoulder", x: 398, y: 404 },
  { key: "elbow", x: 188, y: 378 },
  { key: "sleeve_length", x: 309, y: 517 },
  { key: "armhole", x: 406, y: 517 },
  { key: "sleeve_width", x: 498, y: 517 },
  { key: "chest_upper", x: 404, y: 656 },
  { key: "chest_back", x: 330, y: 764 },
  { key: "chest_front", x: 466, y: 764 },
  { key: "waist_front", x: 317, y: 859 },
  { key: "waist_back", x: 485, y: 856 },
  { key: "bottom", x: 405, y: 946 },
];

function fmt(val: number | string | null | undefined): string {
  if (val == null || val === "") return "";
  const n = Number(val);
  if (isNaN(n) || n === 0) return "";
  const whole = Math.floor(n);
  const rem = n - whole;
  if (rem < 0.01) return `${whole}`;
  if (Math.abs(rem - 0.25) < 0.01) return `${whole} ¼`;
  if (Math.abs(rem - 0.5) < 0.01) return `${whole} ½`;
  if (Math.abs(rem - 0.75) < 0.01) return `${whole} ¾`;
  return n.toFixed(1);
}

interface DishdashaDiagramProps {
  measurement: Measurement | null | undefined;
  className?: string;
}

/**
 * Dishdasha SVG diagram with measurement overlay.
 * Uses inline SVG image so it sizes naturally via viewBox.
 */
export function DishdashaDiagram({ measurement, className }: DishdashaDiagramProps) {
  const m = measurement;
  const degree = m?.degree ? Number(m.degree) : 0;

  const getVal = (key: keyof Measurement) => {
    const raw = m?.[key];
    if (raw == null) return "";
    const n = Number(raw);
    if (isNaN(n) || n === 0) return "";
    return fmt(degree ? n - degree : n);
  };

  return (
    <svg viewBox={VB} className={className}>
      {/* Dishdasha drawing */}
      <image href="/dishdasha.svg" x="85" y="15" width="622" height="1102" opacity={0.35} />

      {/* Measurement values */}
      {m && VALUE_POSITIONS.map(({ key, x, y }) => {
        const val = getVal(key);
        if (!val) return null;
        return (
          <text
            key={key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontWeight={900}
            fontSize={14}
            fontFamily="system-ui, sans-serif"
            fill="#18181b"
          >
            {val}
          </text>
        );
      })}

      {!m && (
        <text
          x={396}
          y={550}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={14}
          fill="#a1a1aa"
          fontStyle="italic"
        >
          No measurements
        </text>
      )}
    </svg>
  );
}
