"use client";

import { compile } from "mathjs";
import { useMemo } from "react";

const W = 520;
const H = 300;
const PAD = 28;
const COLORS = ["var(--plot-1)", "var(--plot-2)", "var(--plot-3)", "var(--plot-4)"];

type Curve = { fn: string; paths: string[] };

/** Graphs are computed from the expression, never sketched by the tutor. */
function sample(fn: string, xmin: number, xmax: number): [number, number][] | null {
  try {
    const code = compile(fn);
    const pts: [number, number][] = [];
    const n = 240;
    for (let i = 0; i <= n; i++) {
      const x = xmin + ((xmax - xmin) * i) / n;
      const y = code.evaluate({ x });
      pts.push([x, typeof y === "number" && Number.isFinite(y) ? y : NaN]);
    }
    return pts;
  } catch {
    return null;
  }
}

function niceStep(span: number): number {
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
}

export function Plot({ fns, xmin = -5, xmax = 5, label }: { fns: string[]; xmin?: number; xmax?: number; label?: string }) {
  const view = useMemo(() => {
    if (!(xmax > xmin)) return null;
    const sampled = fns.map((fn) => ({ fn, pts: sample(fn, xmin, xmax) })).filter((s) => s.pts);
    const ys = sampled.flatMap((s) => s.pts!.map((p) => p[1])).filter(Number.isFinite).sort((a, b) => a - b);
    if (ys.length === 0) return null;
    // Trim extreme values so one asymptote does not flatten everything else.
    let ymin = ys[Math.floor(ys.length * 0.02)];
    let ymax = ys[Math.ceil(ys.length * 0.98) - 1];
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const m = (ymax - ymin) * 0.08;
    ymin -= m; ymax += m;
    const sx = (x: number) => PAD + ((x - xmin) / (xmax - xmin)) * (W - 2 * PAD);
    const sy = (y: number) => H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD);
    const curves: Curve[] = sampled.map(({ fn, pts }) => {
      const paths: string[] = [];
      let cur = "";
      let prev: number | null = null;
      for (const [x, y] of pts!) {
        const inside = Number.isFinite(y) && y >= ymin - (ymax - ymin) && y <= ymax + (ymax - ymin);
        const jump = prev !== null && inside && Math.abs(y - prev) > (ymax - ymin) * 1.5;
        if (!inside || jump) { if (cur) paths.push(cur); cur = ""; prev = null; if (!inside) continue; }
        cur += `${cur ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
        prev = y;
      }
      if (cur) paths.push(cur);
      return { fn, paths };
    });
    const ticks = (lo: number, hi: number) => {
      const step = niceStep(hi - lo);
      const out: number[] = [];
      for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
      return out;
    };
    return { curves, sx, sy, ymin, ymax, xt: ticks(xmin, xmax), yt: ticks(ymin, ymax) };
  }, [fns, xmin, xmax]);

  if (!view) return <p className="font-hand text-lg text-danger">This graph could not be drawn.</p>;
  const { curves, sx, sy, ymin, ymax, xt, yt } = view;
  const axisY = Math.min(Math.max(sy(0), PAD), H - PAD);
  const axisX = Math.min(Math.max(sx(0), PAD), W - PAD);
  const fmt = (v: number) => String(Number(v.toPrecision(6)));
  const title = label ?? `Graph of ${fns.join(", ")}`;

  return (
    <figure className="max-w-xl">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full rounded-md border border-border bg-surface">
        <clipPath id="plot-area"><rect x={PAD} y={PAD / 2} width={W - 2 * PAD} height={H - 1.5 * PAD} /></clipPath>
        {xt.map((v) => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={PAD / 2} y2={H - PAD} stroke="var(--board-line)" />)}
        {yt.map((v) => <line key={`gy${v}`} x1={PAD} x2={W - PAD} y1={sy(v)} y2={sy(v)} stroke="var(--board-line)" />)}
        <line x1={PAD} x2={W - PAD} y1={axisY} y2={axisY} stroke="var(--text-muted)" />
        <line x1={axisX} x2={axisX} y1={PAD / 2} y2={H - PAD} stroke="var(--text-muted)" />
        {xt.filter((v) => v !== 0).map((v) => <text key={`tx${v}`} x={sx(v)} y={Math.min(axisY + 14, H - 6)} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{fmt(v)}</text>)}
        {yt.filter((v) => v !== 0 && v > ymin && v < ymax).map((v) => <text key={`ty${v}`} x={Math.max(axisX - 6, 22)} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{fmt(v)}</text>)}
        <g clipPath="url(#plot-area)" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {curves.map((c, i) => c.paths.map((d, j) => <path key={`${i}-${j}`} d={d} pathLength={1} className="draw" stroke={COLORS[i % COLORS.length]} />))}
        </g>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {curves.map((c, i) => (
          <span key={c.fn} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: COLORS[i % COLORS.length] }} />
            y = {c.fn}
          </span>
        ))}
        {label && <span className="font-hand text-base text-ink">{label}</span>}
      </figcaption>
    </figure>
  );
}
