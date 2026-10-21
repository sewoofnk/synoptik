import { format } from "../lib/units";
import { cursor, layer, units } from "../state/store";

function formatCoord(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
}

// Hodnota poľa pod kurzorom + súradnice
export function CursorTooltip() {
  const c = cursor.value;
  if (!c) return null;
  const l = layer.value;
  return (
    <div class="cursor-tip" style={{ transform: `translate(${c.x + 14}px, ${c.y + 14}px)` }}>
      <b>{Number.isFinite(c.value) ? format(l.quantity, c.value, units.value) : "mimo modelu"}</b>
      <span class="muted">
        {formatCoord(c.lat, "N", "S")} {formatCoord(c.lon, "E", "W")}
      </span>
    </div>
  );
}
