"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import katex from "katex";
import { useMemo } from "react";

// Diagrams the tutor puts on the board: free drawings (SVG it writes, cleaned
// to a safe list of shapes first), flow charts and fraction bars.

const TAGS = new Set(["svg", "g", "path", "line", "polyline", "polygon", "rect", "circle", "ellipse", "text", "tspan", "defs", "marker"]);
const ATTRS = new Set([
  "viewbox", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points", "fill", "stroke",
  "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "font-size", "font-weight", "font-style", "text-anchor",
  "dominant-baseline", "transform", "opacity", "fill-opacity", "stroke-opacity", "marker-end", "marker-start", "id", "refx", "refy",
  "markerwidth", "markerheight", "orient", "markerunits", "dx", "dy",
]);
const DRAWN = new Set(["path", "line", "polyline", "polygon", "circle", "ellipse", "rect"]);

/** Keeps only plain shapes and text; drops scripts, links, images, styles and event handlers. */
function cleanSvg(raw: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (!TAGS.has(child.nodeName.toLowerCase())) child.remove();
      else walk(child);
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      const badUrl = /url\s*\(/i.test(value) && !/^url\(#[\w-]+\)$/.test(value.trim());
      if (!ATTRS.has(name) || badUrl || /javascript:/i.test(value)) el.removeAttribute(attr.name);
    }
    // Lines draw themselves on, like the tutor sketching them.
    if (DRAWN.has(el.nodeName.toLowerCase()) && el.getAttribute("fill") !== null && el.getAttribute("fill") !== "none") el.classList.add("fade-shape");
    else if (DRAWN.has(el.nodeName.toLowerCase())) { el.setAttribute("pathLength", "1"); el.classList.add("draw"); }
  };
  walk(root);
  if (!root.getAttribute("viewBox")) {
    const w = Number(root.getAttribute("width")) || 400;
    const h = Number(root.getAttribute("height")) || 300;
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("role", "img");
  return new XMLSerializer().serializeToString(root);
}

export function Drawing({ svg, label }: { svg: string; label?: string }) {
  const clean = useMemo(() => cleanSvg(svg), [svg]);
  if (!clean) return label ? <p className="font-hand text-2xl text-muted">({label})</p> : null;
  return (
    <figure className="max-w-xl">
      <div
        aria-label={label ?? "Diagram"}
        className="diagram rounded-lg border border-border bg-surface p-3 text-ink [&_svg]:h-auto [&_svg]:max-h-[22rem] [&_svg]:w-full [&_text]:font-hand"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {label && <figcaption className="mt-1 font-hand text-xl text-muted">{label}</figcaption>}
    </figure>
  );
}

export function Flow({ steps, cycle }: { steps: string[]; cycle?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2" style={{ animationDelay: `${i * 220}ms` }}>
          <span className="rise rounded-xl border-2 border-ink/70 bg-surface px-3 py-1.5 font-hand text-xl leading-snug text-ink shadow-[2px_3px_0_rgba(29,42,58,0.12)]" style={{ animationDelay: `${i * 220}ms` }}>
            {s}
          </span>
          {i < steps.length - 1 && <ArrowRight size={22} aria-hidden className="rise shrink-0 text-accent" style={{ animationDelay: `${i * 220 + 110}ms` }} />}
        </div>
      ))}
      {cycle && (
        <span className="rise flex items-center gap-1 font-hand text-lg text-accent" style={{ animationDelay: `${steps.length * 220}ms` }}>
          <RotateCcw size={20} aria-hidden /> and round again
        </span>
      )}
    </div>
  );
}

/** A label like "3/4" shown as a stacked fraction. */
function renderLabel(label: string) {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(label);
  if (!m) return label;
  return <span className="inline-fraction" aria-label={`${m[1]} over ${m[2]}`} dangerouslySetInnerHTML={{ __html: katex.renderToString(`\\dfrac{${m[1]}}{${m[2]}}`, { throwOnError: false }) }} />;
}

export function Bars({ bars }: { bars: { parts: number; shaded: number; label?: string }[] }) {
  return (
    <div className="flex max-w-xl flex-col gap-2">
      {bars.map((b, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex h-10 flex-1 overflow-hidden rounded-md border-2 border-ink/70 bg-surface" role="img" aria-label={b.label ?? `${b.shaded} of ${b.parts} parts shaded`}>
            {Array.from({ length: b.parts }, (_, k) => (
              <span
                key={k}
                className={`rise flex-1 ${k > 0 ? "border-l-2 border-ink/50" : ""} ${k < b.shaded ? "bg-accent/70" : ""}`}
                style={{ animationDelay: `${i * 300 + k * 60}ms` }}
              />
            ))}
          </div>
          {b.label && <span className="min-w-14 font-hand text-2xl text-ink">{renderLabel(b.label)}</span>}
        </div>
      ))}
    </div>
  );
}
