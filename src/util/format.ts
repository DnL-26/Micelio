import Decimal from "break_eternity.js";

function groupThousands(n: number): string {
  return Math.floor(n)
    .toString()
    // Espacio fino: un punto como separador de miles se confunde con decimales ("1.836").
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function fmt(value: Decimal | number): string {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (d.abs().gte(1e6)) return d.toExponential(2).replace("e+", "e");
  const n = d.toNumber();
  const a = Math.abs(n);
  if (a < 1000 && Number.isInteger(n)) return n.toString();
  if (a < 10) return n.toFixed(2);
  if (a < 1000) return n.toFixed(1);
  return (n < 0 ? "-" : "") + groupThousands(a);
}

export function fmtPercent(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}
