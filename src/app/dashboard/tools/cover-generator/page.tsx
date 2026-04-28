"use client";

/* eslint-disable @next/next/no-img-element */

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

// Issue 75 lead image, kept as a local fallback for the seed default so the
// page paints something even before the first Curator fetch. The live tool
// reads `leadImageUrl` from the Curator response into IssueData state.
const HERO_IMAGE_FALLBACK = "/dev-assets/intersect-75-lead.jpg";

type IssueData = {
  number: number;
  date: string; // display-formatted, e.g. "APRIL 28, 2026"
  brand: string; // short masthead, e.g. "THE INTERSECT"
  brandLong: string; // long form for alt text, e.g. "The Intersect"
  tagline: string;
  leadImageUrl: string;
};

const DEFAULT_ISSUE: IssueData = {
  number: 75,
  date: "APRIL 28, 2026",
  brand: "THE INTERSECT",
  brandLong: "The Intersect",
  tagline: "Wrenches, paper, waste — organic holds its ground.",
  leadImageUrl: HERO_IMAGE_FALLBACK,
};

// Convert Curator's "Publication Date" (ISO YYYY-MM-DD or full ISO) into the
// "MONTH D, YYYY" all-caps display format the slides use. Returns null if the
// input can't be parsed so the caller can fall back to the prior value.
function formatPublicationDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [, y, mm, dd] = m;
  const months = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  ];
  const monthIdx = Number(mm) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return `${months[monthIdx]} ${Number(dd)}, ${y}`;
}

const PALETTE = {
  cream: "#f9f8f3",
  ink: "#111111",
  inkSoft: "#3a3a3a",
};

// Both square logos exist in Airtable. Brand settings shows light-bg slot as
// dark wordmark, but inspection shows the file at that URL renders as white
// on this canvas. Robust fix: force tone via CSS filter regardless of
// source color (works for either PNG, since both have transparent bg).
const BRAND_LOGO_SQUARE =
  "https://njhagrdezivhku5m.public.blob.vercel-storage.com/images/brands/recQ69SHPps9W5z0U/logo-dark-square-1777235996268-d69e49.png";
const BRAND_LOGO_RECT =
  "https://njhagrdezivhku5m.public.blob.vercel-storage.com/images/brands/recQ69SHPps9W5z0U/logo-light-rect-1777235996475-b1d659.png";

const SIZE_IG = { w: 1080, h: 1350 }; // Instagram 4:5
const SIZE_LI = { w: 1080, h: 1080 }; // LinkedIn document carousel 1:1
const SCALE = 0.42;
const DISPLAY_W = 1080 * SCALE; // width is always 1080, only height varies

const SizeContext = createContext<{ w: number; h: number }>(SIZE_IG);
const useSize = () => useContext(SizeContext);

function luminance(r: number, g: number, b: number) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function hexLuminance(hex: string) {
  const m = hex.replace("#", "");
  const v =
    m.length === 3
      ? m.split("").map((c) => parseInt(c + c, 16))
      : [
          parseInt(m.slice(0, 2), 16),
          parseInt(m.slice(2, 4), 16),
          parseInt(m.slice(4, 6), 16),
        ];
  return luminance(v[0], v[1], v[2]);
}

function rgbToHex(rgb: string) {
  const m = rgb.match(/\d+/g);
  if (!m) return "#000000";
  const [r, g, b] = m.map(Number);
  return (
    "#" +
    [r, g, b]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}

function hexToHsl(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const expanded = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function adjustLightness(hex: string, deltaPercent: number) {
  const [h, s, l] = hexToHsl(hex);
  const next = Math.max(0, Math.min(100, l + deltaPercent));
  return hslToHex(h, s, next);
}

function useBottomBandSample(src: string) {
  const [color, setColor] = useState<{ rgb: string; isLight: boolean } | null>(
    null,
  );

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const sampleH = Math.max(1, Math.floor(img.naturalHeight * 0.03));
        const data = ctx.getImageData(
          0,
          img.naturalHeight - sampleH,
          img.naturalWidth,
          sampleH,
        ).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
        r = Math.round(r / n);
        g = Math.round(g / n);
        b = Math.round(b / n);
        setColor({
          rgb: `rgb(${r}, ${g}, ${b})`,
          isLight: luminance(r, g, b) > 0.55,
        });
      } catch {
        setColor({ rgb: PALETTE.cream, isLight: true });
      }
    };
    img.onerror = () => setColor({ rgb: PALETTE.cream, isLight: true });
    img.src = src;
  }, [src]);

  return color;
}

type ImagePos = { x: number; y: number; zoom: number };

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

type NumeralPos = { fontSize: number; dx: number; dy: number };

function BgTaglineControls({
  label,
  bgColor,
  onBgColorChange,
  bgLightness,
  onBgLightnessChange,
  bgFinalColor,
  taglineFontSize,
  onTaglineFontSizeChange,
  onReset,
}: {
  label: string;
  bgColor: string | null;
  onBgColorChange: (hex: string | null) => void;
  bgLightness: number;
  onBgLightnessChange: (n: number) => void;
  bgFinalColor: string;
  taglineFontSize: number;
  onTaglineFontSizeChange: (n: number) => void;
  onReset: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 text-xs font-mono text-muted-foreground"
      style={{ width: DISPLAY_W }}
    >
      <div className="flex items-center justify-between">
        <span className="opacity-70">{label} · bg + tagline</span>
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] underline opacity-70 hover:opacity-100"
        >
          reset
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0">Bg ◑</span>
        <input
          type="range"
          min={-50}
          max={50}
          value={bgLightness}
          onChange={(e) => onBgLightnessChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-10 text-right">
          {bgLightness > 0 ? "+" : ""}
          {bgLightness}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0">Tagline</span>
        <button
          type="button"
          onClick={() =>
            onTaglineFontSizeChange(Math.max(20, taglineFontSize - 5))
          }
          className="px-1.5 py-0.5 border border-border rounded hover:bg-muted"
        >
          −
        </button>
        <input
          type="number"
          value={taglineFontSize}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onTaglineFontSizeChange(n);
          }}
          step={5}
          className="w-16 px-1.5 py-0.5 border border-border rounded text-center"
        />
        <button
          type="button"
          onClick={() => onTaglineFontSizeChange(taglineFontSize + 5)}
          className="px-1.5 py-0.5 border border-border rounded hover:bg-muted"
        >
          +
        </button>
        <span className="opacity-60 ml-auto flex items-center gap-1.5">
          <span>Bg</span>
          <label className="relative inline-block w-6 h-6 cursor-pointer">
            <input
              type="color"
              value={bgColor ?? "#f9f8f3"}
              onChange={(e) => onBgColorChange(e.target.value)}
              className="opacity-0 absolute inset-0 cursor-pointer"
            />
            <span
              className="block w-6 h-6 rounded border border-border"
              style={{ background: bgFinalColor }}
            />
          </label>
        </span>
      </div>
    </div>
  );
}

function SelectedStoryRow({
  picks,
  onChange,
}: {
  picks: { title: string; imageUrl: string | null }[];
  onChange: (next: { title: string; imageUrl: string | null }[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= picks.length) return;
    const next = [...picks];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };
  return (
    <div className="flex gap-2 flex-wrap">
      {picks.map((p, i) => (
        <div
          key={`${p.title}-${i}`}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIdx !== null) move(dragIdx, i);
            setDragIdx(null);
          }}
          onDragEnd={() => setDragIdx(null)}
          className={`flex items-center gap-2 px-2 py-1.5 border rounded text-xs bg-background cursor-grab active:cursor-grabbing select-none ${
            dragIdx === i ? "opacity-50" : ""
          }`}
          style={{ width: 220 }}
          title={p.title}
        >
          <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">
            {i + 1}
          </span>
          <div className="w-9 h-9 shrink-0 bg-black/10 rounded overflow-hidden">
            {p.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            )}
          </div>
          <div className="flex-1 leading-tight line-clamp-2">{p.title}</div>
          <button
            type="button"
            onClick={() => onChange(picks.filter((_, j) => j !== i))}
            className="text-muted-foreground hover:text-foreground text-sm leading-none px-1"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function NumberStepper({
  label,
  value,
  onChange,
  step = 5,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div
      className="flex items-center gap-2 text-xs font-mono text-muted-foreground"
      style={{ width: DISPLAY_W }}
    >
      <span className="w-14 shrink-0">{label}</span>
      <button
        type="button"
        onClick={() => onChange(Math.max(min ?? -Infinity, value - step))}
        className="px-1.5 py-0.5 border border-border rounded hover:bg-muted"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        step={step}
        className="w-16 px-1.5 py-0.5 border border-border rounded text-center"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max ?? Infinity, value + step))}
        className="px-1.5 py-0.5 border border-border rounded hover:bg-muted"
      >
        +
      </button>
      <span className="opacity-60">px</span>
    </div>
  );
}

function PdfDownloadButton({
  href,
  filename,
}: {
  href: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onClick = async () => {
    setBusy(true);
    setErr(null);
    try {
      const resp = await fetch(href);
      if (!resp.ok) {
        setErr(`PDF failed: ${resp.status} ${(await resp.text()).slice(0, 100)}`);
        return;
      }
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      setErr(`PDF error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="px-3 py-1.5 border border-border rounded text-xs hover:bg-muted disabled:opacity-50 flex items-center gap-1.5"
        title="Render all 3 slides + assemble into a single PDF (LinkedIn carousel)"
      >
        {busy ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Rendering PDF (~30s)…
          </>
        ) : (
          <>↓ Download PDF (3 slides)</>
        )}
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </>
  );
}

function DownloadButton({
  href,
  filename,
}: {
  href: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onClick = async () => {
    setBusy(true);
    setErr(null);
    try {
      const resp = await fetch(href);
      if (!resp.ok) {
        const txt = await resp.text();
        setErr(`Download failed: ${resp.status} ${txt.slice(0, 120)}`);
        return;
      }
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      setErr(`Download error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1" style={{ width: DISPLAY_W }}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="px-3 py-1.5 border border-border rounded bg-foreground text-background text-xs font-medium hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Rendering 1080×1350 PNG (~10s)…
          </>
        ) : (
          <>↓ Download PNG (1080×1350)</>
        )}
      </button>
      {err && (
        <div className="text-[10px] px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}

function NumeralControls({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: NumeralPos;
  onChange: (n: NumeralPos) => void;
  onReset: () => void;
}) {
  const STEP = 5;
  const Stepper = ({
    name,
    field,
    min,
  }: {
    name: string;
    field: keyof NumeralPos;
    min?: number;
  }) => (
    <div className="flex items-center gap-1.5">
      <span className="w-7 shrink-0">{name}</span>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            [field]:
              min !== undefined
                ? Math.max(min, value[field] - STEP)
                : value[field] - STEP,
          })
        }
        className="px-1.5 py-0.5 border border-border rounded hover:bg-muted"
      >
        −
      </button>
      <input
        type="number"
        value={value[field]}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange({ ...value, [field]: n });
        }}
        className="w-14 px-1 py-0.5 border border-border rounded text-center"
        step={STEP}
      />
      <button
        type="button"
        onClick={() =>
          onChange({ ...value, [field]: value[field] + STEP })
        }
        className="px-1.5 py-0.5 border border-border rounded hover:bg-muted"
      >
        +
      </button>
    </div>
  );
  return (
    <div
      className="flex flex-col gap-1.5 text-xs font-mono text-muted-foreground"
      style={{ width: DISPLAY_W }}
    >
      <div className="flex items-center justify-between">
        <span className="opacity-70">{label}</span>
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] underline opacity-70 hover:opacity-100"
        >
          reset
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Stepper name="size" field="fontSize" min={40} />
        <Stepper name="x" field="dx" />
        <Stepper name="y" field="dy" />
      </div>
      <div className="text-[10px] opacity-60">
        Drag the 74 directly on the canvas to nudge · values: {`{ fontSize: ${value.fontSize}, dx: ${value.dx}, dy: ${value.dy} }`}
      </div>
    </div>
  );
}

function DraggableNumeral({
  value,
  rowH,
  pos,
  onChange,
  fontFamily = '"Noto Serif", Georgia, serif',
  fontWeight = 700,
  letterSpacing = -8,
  color,
  opacity = 1,
}: {
  value: string | number;
  rowH: number;
  pos: NumeralPos;
  onChange: (next: NumeralPos) => void;
  fontFamily?: string;
  fontWeight?: number;
  letterSpacing?: number;
  color: string;
  opacity?: number;
}) {
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);

  return (
    <div
      onPointerDown={(e) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setDrag({
          x: e.clientX,
          y: e.clientY,
          dx: pos.dx,
          dy: pos.dy,
        });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        // Mouse coords are in DISPLAY pixels (canvas is rendered at SCALE);
        // convert back to canvas coords so 1 display px feels like 1 canvas px.
        const ddx = (e.clientX - drag.x) / SCALE;
        const ddy = (e.clientY - drag.y) / SCALE;
        onChange({
          ...pos,
          dx: Math.round(drag.dx + ddx),
          dy: Math.round(drag.dy + ddy),
        });
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        setDrag(null);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        height: rowH,
        fontFamily,
        fontWeight,
        fontSize: pos.fontSize,
        lineHeight: 1,
        letterSpacing,
        color,
        opacity,
        userSelect: "none",
        touchAction: "none",
        cursor: drag ? "grabbing" : "grab",
        transform: `translate(${pos.dx}px, ${pos.dy}px)`,
      }}
    >
      {value}
    </div>
  );
}

function useLocalStorage<T>(key: string, initial: T) {
  // Always start with `initial` on both server and first client render so
  // hydration matches. Read localStorage AFTER mount, then re-render with
  // the stored value if any.
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value, hydrated]);
  return [value, setValue] as const;
}

// Render a numeral as inline SVG with the viewBox calibrated to the font's
// cap height (not the em-box). The glyph cap fills the viewBox vertically so
// the rendered output matches the requested height exactly. Width is measured
// at runtime via getComputedTextLength.
function SVGNumeral({
  value,
  height,
  fontFamily = '"Noto Serif", Georgia, serif',
  fontWeight = 700,
  letterSpacing = -3,
  color,
  opacity = 1,
  capRatio = 0.71, // Noto Serif Bold cap-height / em ≈ 0.71
}: {
  value: string | number;
  height: number;
  fontFamily?: string;
  fontWeight?: number;
  letterSpacing?: number;
  color: string;
  opacity?: number;
  capRatio?: number;
}) {
  const text = String(value);
  const REF = 100;
  const CAP = REF * capRatio; // viewBox height in coordinate space
  const [width, setWidth] = useState(text.length * REF * 0.65);
  const measureRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled || !measureRef.current) return;
      try {
        const w = measureRef.current.getComputedTextLength();
        if (w > 0) setWidth(w);
      } catch {
        // ignore — keep estimate
      }
    };
    measure();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure);
    }
    const t = setTimeout(measure, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, fontFamily, fontWeight, letterSpacing]);

  const displayWidth = (width / CAP) * height;

  return (
    <>
      {/* Off-screen measurement SVG with real dimensions so the text actually
          renders and getComputedTextLength returns a usable value. */}
      <svg
        style={{
          position: "absolute",
          left: -99999,
          top: 0,
          width: 1500,
          height: 200,
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <text
          ref={measureRef}
          x="0"
          y="100"
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontSize={REF}
          letterSpacing={letterSpacing}
        >
          {text}
        </text>
      </svg>

      {/* Visible: viewBox is exactly the cap-height region.
          Glyph baseline at y=0, cap top at y=-CAP. */}
      <svg
        width={displayWidth}
        height={height}
        viewBox={`0 -${CAP} ${width} ${CAP}`}
        style={{
          display: "block",
          color,
          opacity,
          overflow: "visible",
        }}
        aria-label={text}
      >
        <text
          x="0"
          y="0"
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontSize={REF}
          letterSpacing={letterSpacing}
          fill="currentColor"
        >
          {text}
        </text>
      </svg>
    </>
  );
}

function CanvasFrame({
  children,
  label,
  rightControls,
}: {
  children: React.ReactNode;
  label: string;
  rightControls?: React.ReactNode;
}) {
  const size = useSize();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-mono text-muted-foreground">{label}</div>
        {rightControls}
      </div>
      <div
        className="relative overflow-hidden border border-black/10 shadow-md"
        style={{ width: DISPLAY_W, height: size.h * SCALE }}
      >
        <div
          style={{
            width: size.w,
            height: size.h,
            transform: `scale(${SCALE})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function ImageEditorControls({
  imagePos,
  onChange,
  bandColor,
  onBandColorChange,
  onResetBand,
  bandColorSampled,
  bandLightness,
  onBandLightnessChange,
  bandBlur,
  onBandBlurChange,
  bandFinalColor,
  onUpscale,
  upscaleStatus,
}: {
  imagePos: ImagePos;
  onChange: (next: ImagePos) => void;
  bandColor?: string | null;
  onBandColorChange?: (hex: string) => void;
  onResetBand?: () => void;
  bandColorSampled?: string | null;
  bandLightness?: number;
  onBandLightnessChange?: (n: number) => void;
  bandBlur?: number;
  onBandBlurChange?: (n: number) => void;
  bandFinalColor?: string;
  onUpscale?: () => void;
  upscaleStatus?: { state: "idle" | "running" | "done" | "error"; message?: string };
}) {
  const upscaling = upscaleStatus?.state === "running";
  const showBandControls =
    onBandColorChange !== undefined || onBandLightnessChange !== undefined;
  return (
    <div
      className="flex flex-col gap-1.5 text-xs text-muted-foreground font-mono"
      style={{ width: DISPLAY_W }}
    >
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0">Zoom</span>
        <input
          type="range"
          min={100}
          max={250}
          value={Math.round(imagePos.zoom * 100)}
          onChange={(e) =>
            onChange({ ...imagePos, zoom: Number(e.target.value) / 100 })
          }
          className="flex-1"
        />
        <span className="w-10 text-right">
          {Math.round(imagePos.zoom * 100)}%
        </span>
      </div>
      {showBandControls && (
        <>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0">Band ◑</span>
            <input
              type="range"
              min={-50}
              max={50}
              value={bandLightness ?? 0}
              onChange={(e) =>
                onBandLightnessChange?.(Number(e.target.value))
              }
              className="flex-1"
            />
            <span className="w-10 text-right">
              {(bandLightness ?? 0) > 0 ? "+" : ""}
              {bandLightness ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0">Band ⇩</span>
            <input
              type="range"
              min={0}
              max={300}
              value={bandBlur ?? 0}
              onChange={(e) => onBandBlurChange?.(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-10 text-right">{bandBlur ?? 0}px</span>
          </div>
        </>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onChange({ x: 50, y: 50, zoom: 1 })}
          className="px-2 py-1 border border-border rounded hover:bg-muted"
        >
          Reset position
        </button>
        {onUpscale && (
          <button
            type="button"
            onClick={onUpscale}
            disabled={upscaling}
            className="px-2 py-1 border border-border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
            title="Run Real-ESRGAN on the source. Takes ~10-30s."
          >
            {upscaling ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Upscaling…
              </>
            ) : (
              <>↑ Upscale source</>
            )}
          </button>
        )}
        {onBandColorChange && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span>Band</span>
            <label className="relative inline-block w-6 h-6 cursor-pointer">
              <input
                type="color"
                value={bandColor ?? bandColorSampled ?? "#000000"}
                onChange={(e) => onBandColorChange(e.target.value)}
                className="opacity-0 absolute inset-0 cursor-pointer"
              />
              <span
                className="block w-6 h-6 rounded border border-border"
                style={{ background: bandFinalColor ?? "#000" }}
              />
            </label>
            {onResetBand && (bandColor || bandLightness || bandBlur) && (
              <button
                type="button"
                onClick={onResetBand}
                className="text-[10px] underline opacity-70 hover:opacity-100"
              >
                reset
              </button>
            )}
          </div>
        )}
      </div>
      <div className="text-[10px] opacity-60">
        Drag image · zoom slider for scale · pos {imagePos.x}% / {imagePos.y}%
      </div>
      {upscaleStatus && upscaleStatus.state !== "idle" && (
        <div
          className={`text-[10px] px-2 py-1 rounded border ${
            upscaleStatus.state === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : upscaleStatus.state === "done"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-blue-50 border-blue-200 text-blue-700"
          }`}
        >
          {upscaleStatus.message}
        </div>
      )}
    </div>
  );
}

function DraggableImage({
  src,
  imagePos,
  onChange,
}: {
  src: string;
  imagePos: ImagePos;
  onChange: (next: ImagePos) => void;
}) {
  const size = useSize();
  const displayH = size.h * SCALE;
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    posX: number;
    posY: number;
  } | null>(null);

  return (
    <div
      onPointerDown={(e) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setDrag({
          x: e.clientX,
          y: e.clientY,
          posX: imagePos.x,
          posY: imagePos.y,
        });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        const sensitivity = 1 / imagePos.zoom;
        onChange({
          ...imagePos,
          x: clamp(drag.posX - (dx / DISPLAY_W) * 100 * sensitivity),
          y: clamp(drag.posY - (dy / displayH) * 100 * sensitivity),
        });
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        setDrag(null);
      }}
      style={{
        position: "absolute",
        inset: 0,
        cursor: drag ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${imagePos.x}% ${imagePos.y}%`,
          transform: `scale(${imagePos.zoom})`,
          transformOrigin: `${imagePos.x}% ${imagePos.y}%`,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </div>
  );
}

function TemplateA({
  heroSrc,
  imagePos,
  onChange,
  bandFinalColor,
  bandBlur = 0,
  taglineFontSize = 52,
  cta = "READ IN BIO →",
  numeralLeft = false,
  numeralLight = true,
  numeralOpacity = 18,
  issueNumber,
  brand,
  tagline,
  date,
}: {
  heroSrc: string;
  imagePos: ImagePos;
  onChange: (next: ImagePos) => void;
  bandFinalColor: string;
  bandBlur?: number;
  taglineFontSize?: number;
  cta?: string;
  numeralLeft?: boolean;
  numeralLight?: boolean; // true = white, false = black
  numeralOpacity?: number; // percentage 0–100, default 18
  issueNumber: number;
  brand: string;
  tagline: string;
  date: string;
}) {
  const size = useSize();
  const bandIsLight = hexLuminance(
    bandFinalColor.startsWith("#")
      ? bandFinalColor
      : rgbToHex(bandFinalColor),
  ) > 0.55;
  const textInk = bandIsLight ? PALETTE.ink : "#ffffff";
  const textInkSoft = bandIsLight ? PALETTE.inkSoft : "rgba(255,255,255,0.75)";
  // Top-of-canvas masthead text uses mixBlendMode: "screen" against the
  // photo, so it stays white regardless of the numeral toggle below.
  const numeralRgb = "255,255,255";
  // Big background numeral — user-toggleable light/dark + opacity.
  const bigNumeralRgb = numeralLight ? "255,255,255" : "0,0,0";
  const bigNumeralAlpha = Math.max(0, Math.min(100, numeralOpacity)) / 100;

  return (
    <div
      style={{
        width: size.w,
        height: size.h,
        background: bandFinalColor,
        color: textInk,
        display: "flex",
        flexDirection: "column",
        fontFamily: '"Noto Sans", system-ui, sans-serif',
      }}
    >
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <DraggableImage src={heroSrc} imagePos={imagePos} onChange={onChange} />

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            padding: "44px 60px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: `rgba(${numeralRgb},0.85)`,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        >
          {numeralLeft ? (
            <>
              <div style={{ fontSize: 22, letterSpacing: 3 }}>
                ISSUE NO. {issueNumber}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4 }}>
                {brand}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4 }}>
                {brand}
              </div>
              <div style={{ fontSize: 22, letterSpacing: 3 }}>
                ISSUE NO. {issueNumber}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            position: "absolute",
            top: 60,
            ...(numeralLeft ? { left: 60 } : { right: 60 }),
            fontFamily: '"Noto Serif", Georgia, serif',
            fontWeight: 700,
            fontSize: 460,
            lineHeight: 0.85,
            letterSpacing: -18,
            color: `rgba(${bigNumeralRgb},${bigNumeralAlpha})`,
            pointerEvents: "none",
          }}
        >
          {issueNumber}
        </div>

        {bandBlur > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: bandBlur,
              background: `linear-gradient(to bottom, transparent 0%, ${bandFinalColor} 100%)`,
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      <div
        style={{
          padding: "50px 80px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          background: bandFinalColor,
        }}
      >
        <div
          style={{
            fontFamily: '"Noto Serif", Georgia, serif',
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: taglineFontSize,
            lineHeight: 1.15,
            letterSpacing: -1,
            color: textInk,
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 22,
            letterSpacing: 3,
            color: textInkSoft,
            paddingTop: 20,
            borderTop: `1px solid ${bandIsLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.25)"}`,
          }}
        >
          <div>{date}</div>
          <div style={{ color: textInk, fontWeight: 600 }}>{cta}</div>
        </div>
      </div>
    </div>
  );
}

type Story = { title: string; imageUrl: string | null };

function TemplateB_Square({
  numeralPos,
  onNumeralChange,
  stories,
  tagline,
  bgColor = PALETTE.cream,
  taglineFontSize = 50,
  cta = "LINK IN BIO →",
  logoLeft = true,
  issueNumber,
  brandLong,
  date,
}: {
  numeralPos: NumeralPos;
  onNumeralChange: (next: NumeralPos) => void;
  stories: Story[];
  tagline: string;
  bgColor?: string;
  taglineFontSize?: number;
  cta?: string;
  logoLeft?: boolean;
  issueNumber: number;
  brandLong: string;
  date: string;
}) {
  const size = useSize();
  const inset = 60;
  const ROW_H = 240;
  const bgIsLight = hexLuminance(bgColor) > 0.55;
  const fg = bgIsLight ? PALETTE.ink : "#f5f4ee";
  const fgSoft = bgIsLight ? PALETTE.inkSoft : "rgba(245,244,238,0.7)";
  const borderTop = bgIsLight
    ? "rgba(0,0,0,0.15)"
    : "rgba(255,255,255,0.18)";
  return (
    <div
      style={{
        width: size.w,
        height: size.h,
        background: bgColor,
        color: fg,
        display: "flex",
        flexDirection: "column",
        fontFamily: '"Noto Sans", system-ui, sans-serif',
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: inset,
          left: inset,
          right: inset,
          height: ROW_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {logoLeft ? (
          <>
            <img
              src={BRAND_LOGO_SQUARE}
              alt={brandLong}
              style={{
                height: ROW_H,
                width: ROW_H,
                objectFit: "contain",
                opacity: 0.5,
                filter: bgIsLight
                  ? "brightness(0)"
                  : "brightness(0) invert(1)",
              }}
            />
            <DraggableNumeral
              value={issueNumber}
              rowH={ROW_H}
              pos={numeralPos}
              onChange={onNumeralChange}
              letterSpacing={-10}
              color={fg}
              opacity={0.5}
            />
          </>
        ) : (
          <>
            <DraggableNumeral
              value={issueNumber}
              rowH={ROW_H}
              pos={numeralPos}
              onChange={onNumeralChange}
              letterSpacing={-10}
              color={fg}
              opacity={0.5}
            />
            <img
              src={BRAND_LOGO_SQUARE}
              alt={brandLong}
              style={{
                height: ROW_H,
                width: ROW_H,
                objectFit: "contain",
                opacity: 0.5,
                filter: bgIsLight
                  ? "brightness(0)"
                  : "brightness(0) invert(1)",
              }}
            />
          </>
        )}
      </div>

      <div style={{ height: inset + ROW_H + inset, flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows:
            stories.length <= 2 ? "auto" : "auto auto",
          gap: 12,
          padding: `0 ${inset}px`,
          alignContent: "center",
        }}
      >
        {stories.slice(0, 4).map((s, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              overflow: "hidden",
              background: "#222",
              aspectRatio: "16 / 11",
            }}
          >
            {s.imageUrl ? (
              <img
                src={s.imageUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: 0.95,
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(135deg,#1a1a1a,#2e2e2e)",
                }}
              />
            )}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "60px 18px 14px",
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)",
                color: "#fff",
                fontFamily: '"Noto Sans", system-ui, sans-serif',
                fontWeight: 400,
                fontSize: 19,
                lineHeight: 1.3,
                letterSpacing: 0.1,
              }}
            >
              {s.title}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: `${inset}px ${inset}px ${inset}px`,
          display: "flex",
          flexDirection: "column",
          gap: 28,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: '"Noto Serif", Georgia, serif',
            fontStyle: "italic",
            fontSize: taglineFontSize,
            color: fg,
            lineHeight: 1.18,
            letterSpacing: -0.5,
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingTop: 22,
            borderTop: `1px solid ${borderTop}`,
            fontSize: 22,
            letterSpacing: 3,
          }}
        >
          <div style={{ color: fgSoft }}>{date}</div>
          <div style={{ color: fg, fontWeight: 700 }}>{cta}</div>
        </div>
      </div>
    </div>
  );
}

function TemplateB_Rect({
  numeralPos,
  onNumeralChange,
  stories,
  tagline,
  bgColor = PALETTE.cream,
  taglineFontSize = 44,
  cta = "LINK IN BIO →",
  logoLeft = true,
  issueNumber,
  brandLong,
  date,
}: {
  numeralPos: NumeralPos;
  onNumeralChange: (next: NumeralPos) => void;
  stories: Story[];
  tagline: string;
  bgColor?: string;
  taglineFontSize?: number;
  cta?: string;
  logoLeft?: boolean;
  issueNumber: number;
  brandLong: string;
  date: string;
}) {
  const size = useSize();
  const inset = 60;
  const ROW_H = 200;
  const bgIsLight = hexLuminance(bgColor) > 0.55;
  const bg = bgColor;
  const fg = bgIsLight ? PALETTE.ink : "#f5f4ee";
  const fgSoft = bgIsLight ? PALETTE.inkSoft : "rgba(245,244,238,0.7)";
  const borderTop = bgIsLight
    ? "rgba(0,0,0,0.15)"
    : "rgba(255,255,255,0.18)";

  return (
    <div
      style={{
        width: size.w,
        height: size.h,
        background: bg,
        color: fg,
        display: "flex",
        flexDirection: "column",
        fontFamily: '"Noto Sans", system-ui, sans-serif',
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: inset,
          left: inset,
          right: inset,
          height: ROW_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {logoLeft ? (
          <>
            <img
              src={BRAND_LOGO_RECT}
              alt={brandLong}
              style={{
                height: ROW_H,
                width: "auto",
                objectFit: "contain",
                opacity: 0.5,
                filter: bgIsLight
                  ? "brightness(0)"
                  : "brightness(0) invert(1)",
              }}
            />
            <DraggableNumeral
              value={issueNumber}
              rowH={ROW_H}
              pos={numeralPos}
              onChange={onNumeralChange}
              letterSpacing={-8}
              color={fg}
              opacity={0.5}
            />
          </>
        ) : (
          <>
            <DraggableNumeral
              value={issueNumber}
              rowH={ROW_H}
              pos={numeralPos}
              onChange={onNumeralChange}
              letterSpacing={-8}
              color={fg}
              opacity={0.5}
            />
            <img
              src={BRAND_LOGO_RECT}
              alt={brandLong}
              style={{
                height: ROW_H,
                width: "auto",
                objectFit: "contain",
                opacity: 0.5,
                filter: bgIsLight
                  ? "brightness(0)"
                  : "brightness(0) invert(1)",
              }}
            />
          </>
        )}
      </div>

      <div style={{ height: inset + ROW_H + inset, flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows:
            stories.length <= 2 ? "auto" : "auto auto",
          gap: 12,
          padding: `0 ${inset}px`,
          alignContent: "center",
        }}
      >
        {stories.slice(0, 4).map((s, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              overflow: "hidden",
              background: "#222",
              aspectRatio: "16 / 11",
            }}
          >
            {s.imageUrl ? (
              <img
                src={s.imageUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: 0.95,
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(135deg,#1a1a1a,#2e2e2e)",
                }}
              />
            )}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "60px 18px 14px",
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)",
                color: "#fff",
                fontFamily: '"Noto Sans", system-ui, sans-serif',
                fontWeight: 400,
                fontSize: 19,
                lineHeight: 1.3,
                letterSpacing: 0.1,
              }}
            >
              {s.title}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: `${inset}px ${inset}px ${inset}px`,
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div
          style={{
            fontFamily: '"Noto Serif", Georgia, serif',
            fontStyle: "italic",
            fontSize: taglineFontSize,
            color: fg,
            lineHeight: 1.2,
            letterSpacing: -0.5,
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingTop: 22,
            borderTop: `1px solid ${borderTop}`,
            fontSize: 22,
            letterSpacing: 3,
          }}
        >
          <div style={{ color: fgSoft }}>{date}</div>
          <div style={{ color: fg, fontWeight: 700 }}>{cta}</div>
        </div>
      </div>
    </div>
  );
}

function TemplateC({
  heroSrc,
  imagePos,
  onChange,
  taglineFontSize = 56,
  cta = "LINK IN BIO →",
  issueNumber,
  brand,
  tagline,
  date,
}: {
  heroSrc: string;
  imagePos: ImagePos;
  onChange: (next: ImagePos) => void;
  taglineFontSize?: number;
  cta?: string;
  issueNumber: number;
  brand: string;
  tagline: string;
  date: string;
}) {
  const size = useSize();
  const numeralRgb = "255,255,255";
  return (
    <div
      style={{
        width: size.w,
        height: size.h,
        background: PALETTE.ink,
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        fontFamily: '"Noto Sans", system-ui, sans-serif',
      }}
    >
      <DraggableImage src={heroSrc} imagePos={imagePos} onChange={onChange} />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "44px 60px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: `rgba(${numeralRgb},0.85)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
          {brand}
        </div>
        <div style={{ fontSize: 18, letterSpacing: 3 }}>
          ISSUE NO. {issueNumber}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 32%, rgba(0,0,0,0) 55%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          bottom: 100,
          display: "flex",
          flexDirection: "column",
          gap: 32,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily: '"Noto Serif", Georgia, serif',
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: taglineFontSize,
            lineHeight: 1.15,
            letterSpacing: -1,
            color: "#fff",
            maxWidth: 880,
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 22,
            letterSpacing: 3,
            color: "#fff",
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.35)",
            fontWeight: 700,
          }}
        >
          <div style={{ fontWeight: 400, opacity: 0.8 }}>{date}</div>
          <div>{cta}</div>
        </div>
      </div>
    </div>
  );
}

type UpscaleStatus = {
  state: "idle" | "running" | "done" | "error";
  message?: string;
};

// Wrapped at the bottom in a Suspense boundary so the inner component's
// useSearchParams() doesn't fail Next.js's CSR-bailout check at build time.
function OverviewCoversDevPage() {
  const searchParams = useSearchParams();
  const renderSlide = searchParams.get("render") as
    | "A"
    | "2a"
    | "2b"
    | "C"
    | null;
  // For render mode, prefer query-param state; defaults match the baked-in.
  const qpNum = (k: string, d: number) => {
    const v = searchParams.get(k);
    return v !== null ? Number(v) : d;
  };
  const qpStr = (k: string, d: string | null = null) =>
    searchParams.get(k) ?? d;

  // Issue data: single source of truth for everything that varies per issue
  // (number, date, brand, tagline, lead image). Render-mode hydrates these
  // from query params via DEFAULT_ISSUE merge; normal mode persists to
  // localStorage so a refresh keeps the active issue's data on screen.
  const initialIssueData: IssueData = {
    number: qpNum("n", DEFAULT_ISSUE.number),
    date: (qpStr("dt") as string | null) ?? DEFAULT_ISSUE.date,
    brand: (qpStr("br") as string | null) ?? DEFAULT_ISSUE.brand,
    brandLong: (qpStr("bln") as string | null) ?? DEFAULT_ISSUE.brandLong,
    tagline: (qpStr("tg") as string | null) ?? DEFAULT_ISSUE.tagline,
    leadImageUrl:
      (qpStr("hero") as string | null) ?? DEFAULT_ISSUE.leadImageUrl,
  };
  const [issueData, setIssueData] = useLocalStorage<IssueData>(
    "overview-cover-issueData",
    initialIssueData,
  );

  // heroSrc tracks the actual rendered hero image — usually issueData.leadImageUrl,
  // but the Upscale flow swaps in a Replicate URL that should persist independently.
  // useLocalStorage keeps the upscaled URL across refreshes; fetchIssue resets it.
  const [heroSrc, setHeroSrc] = useLocalStorage<string>(
    "overview-cover-heroSrc",
    initialIssueData.leadImageUrl,
  );
  const [posA, setPosA] = useLocalStorage<ImagePos>(
    "overview-cover-posA",
    {
      x: qpNum("ax", 50),
      y: qpNum("ay", 50),
      zoom: qpNum("az", 1),
    },
  );
  const [posC, setPosC] = useLocalStorage<ImagePos>(
    "overview-cover-posC",
    {
      x: qpNum("cx", 50),
      y: qpNum("cy", 50),
      zoom: qpNum("cz", 1),
    },
  );
  const [bandColorOverrideA, setBandColorOverrideA] = useLocalStorage<
    string | null
  >("overview-cover-bandColorA", qpStr("bc"));
  const [bandLightnessA, setBandLightnessA] = useLocalStorage<number>(
    "overview-cover-bandLightnessA",
    qpNum("bl", 0),
  );
  const [bandBlurA, setBandBlurA] = useLocalStorage<number>(
    "overview-cover-bandBlurA",
    qpNum("bb", 0),
  );
  const [bg2a, setBg2a] = useLocalStorage<string | null>(
    "overview-cover-bg2a",
    qpStr("bg2a"),
  );
  const [bgL2a, setBgL2a] = useLocalStorage<number>(
    "overview-cover-bgL2a",
    qpNum("bgL2a", 0),
  );
  const [bg2b, setBg2b] = useLocalStorage<string | null>(
    "overview-cover-bg2b",
    qpStr("bg2b"),
  );
  const [bgL2b, setBgL2b] = useLocalStorage<number>(
    "overview-cover-bgL2b",
    qpNum("bgL2b", 0),
  );
  const [tagFs2a, setTagFs2a] = useLocalStorage<number>(
    "overview-cover-tagFs2a",
    qpNum("t2afs", 50),
  );
  const [tagFs2b, setTagFs2b] = useLocalStorage<number>(
    "overview-cover-tagFs2b",
    qpNum("t2bfs", 44),
  );
  const bgFinal2a = adjustLightness(bg2a ?? PALETTE.cream, bgL2a);
  const bgFinal2b = adjustLightness(bg2b ?? PALETTE.cream, bgL2b);
  const [numeralA, setNumeralA] = useLocalStorage<NumeralPos>(
    "overview-cover-numeralA",
    {
      fontSize: qpNum("nafs", 265),
      dx: qpNum("nadx", -29),
      dy: qpNum("nady", -48),
    },
  );
  const [numeralB, setNumeralB] = useLocalStorage<NumeralPos>(
    "overview-cover-numeralB",
    {
      fontSize: qpNum("nbfs", 225),
      dx: qpNum("nbdx", -11),
      dy: qpNum("nbdy", -41),
    },
  );
  const [slide1NumeralLeft, setSlide1NumeralLeft] = useLocalStorage<boolean>(
    "overview-cover-slide1NumeralLeft",
    qpStr("s1l") === "1",
  );
  // Slide 1 big numeral: light/dark + opacity. Default light + 18% to match
  // the prior baked-in `rgba(255,255,255,0.18)`.
  const [slide1NumeralLight, setSlide1NumeralLight] = useLocalStorage<boolean>(
    "overview-cover-slide1NumeralLight",
    qpStr("s1nl") !== null ? qpStr("s1nl") === "1" : true,
  );
  const [slide1NumeralOpacity, setSlide1NumeralOpacity] =
    useLocalStorage<number>(
      "overview-cover-slide1NumeralOpacity",
      qpNum("s1no", 18),
    );
  const [slide2aLogoLeft, setSlide2aLogoLeft] = useLocalStorage<boolean>(
    "overview-cover-slide2aLogoLeft",
    qpStr("s2al") !== null ? qpStr("s2al") === "1" : true,
  );
  const [slide2bLogoLeft, setSlide2bLogoLeft] = useLocalStorage<boolean>(
    "overview-cover-slide2bLogoLeft",
    qpStr("s2bl") !== null ? qpStr("s2bl") === "1" : true,
  );
  const [upscale, setUpscale] = useState<UpscaleStatus>({ state: "idle" });
  const [taglineFsA, setTaglineFsA] = useLocalStorage<number>(
    "overview-cover-taglineFsA",
    qpNum("tafs", 52),
  );
  const [taglineFsC, setTaglineFsC] = useLocalStorage<number>(
    "overview-cover-taglineFsC",
    qpNum("tcfs", 56),
  );
  // Staged issue number — what's typed into the input. Distinct from
  // issueData.number, which is what's currently rendered. Stays in sync with
  // issueData on hydration so the input doesn't show stale defaults.
  const [issueNumber, setIssueNumber] = useState<number>(
    qpNum("issue", initialIssueData.number),
  );
  useEffect(() => {
    setIssueNumber(issueData.number);
    // Re-sync only when persisted issueData hydrates with a different number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueData.number]);
  const [format, setFormat] = useLocalStorage<"ig" | "li">(
    "overview-cover-format",
    (qpStr("fmt") as "ig" | "li") ?? "ig",
  );
  const currentSize = useMemo(
    () => (format === "li" ? SIZE_LI : SIZE_IG),
    [format],
  );
  const liUrl = `intersect.art/issues/${issueNumber}`;
  const slide1Cta = format === "li" ? liUrl : "READ IN BIO →";
  const slide2Cta = format === "li" ? liUrl : "LINK IN BIO →";
  const slide3Cta =
    format === "li" ? liUrl : `READ ISSUE ${issueNumber} — LINK IN BIO →`;
  // Story picks: live picker writes here. Render mode (Puppeteer headless,
  // empty localStorage) hydrates from the `sp` URL param so the downloaded
  // PNG/PDF includes the same stories the user picked.
  const initialStoryPicks: { title: string; imageUrl: string | null }[] = (() => {
    const raw = qpStr("sp");
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore — fall through to []
    }
    return [];
  })();
  const [storyPicks, setStoryPicks] = useLocalStorage<
    { title: string; imageUrl: string | null }[]
  >("overview-cover-storyPicks", initialStoryPicks);

  const sampleA = useBottomBandSample(heroSrc);
  const sampledHex = sampleA ? rgbToHex(sampleA.rgb) : null;

  const baseHex =
    bandColorOverrideA ?? sampledHex ?? PALETTE.cream;
  const finalHex = adjustLightness(baseHex, bandLightnessA);

  const onResetBand = () => {
    setBandColorOverrideA(null);
    setBandLightnessA(0);
    setBandBlurA(0);
  };

  const buildDownloadHref = (
    slide: "A" | "2a" | "2b" | "C",
  ): string => {
    const sp = new URLSearchParams({ slide });
    sp.set("fmt", format);
    // Issue data flows to render mode through these params so the rendered PNG
    // matches what's on screen.
    sp.set("n", String(issueData.number));
    sp.set("dt", issueData.date);
    sp.set("br", issueData.brand);
    sp.set("bln", issueData.brandLong);
    sp.set("tg", issueData.tagline);
    if (slide === "A" || slide === "C") {
      sp.set("hero", heroSrc);
    }
    if (slide === "A") {
      sp.set("ax", String(posA.x));
      sp.set("ay", String(posA.y));
      sp.set("az", String(posA.zoom));
      if (bandColorOverrideA) sp.set("bc", bandColorOverrideA);
      sp.set("bl", String(bandLightnessA));
      sp.set("bb", String(bandBlurA));
      if (slide1NumeralLeft) sp.set("s1l", "1");
      sp.set("s1nl", slide1NumeralLight ? "1" : "0");
      sp.set("s1no", String(slide1NumeralOpacity));
    }
    if (slide === "C") {
      sp.set("cx", String(posC.x));
      sp.set("cy", String(posC.y));
      sp.set("cz", String(posC.zoom));
    }
    if (slide === "2a" || slide === "2b") {
      // Story picks need to flow into render mode via the URL — Puppeteer
      // launches with empty localStorage, so without this the download falls
      // back to an empty grid.
      if (storyPicks.length > 0) {
        sp.set("sp", JSON.stringify(storyPicks));
      }
    }
    if (slide === "2a") {
      sp.set("nafs", String(numeralA.fontSize));
      sp.set("nadx", String(numeralA.dx));
      sp.set("nady", String(numeralA.dy));
      if (bg2a) sp.set("bg2a", bg2a);
      sp.set("bgL2a", String(bgL2a));
      sp.set("t2afs", String(tagFs2a));
      sp.set("s2al", slide2aLogoLeft ? "1" : "0");
    }
    if (slide === "2b") {
      sp.set("nbfs", String(numeralB.fontSize));
      sp.set("nbdx", String(numeralB.dx));
      sp.set("nbdy", String(numeralB.dy));
      if (bg2b) sp.set("bg2b", bg2b);
      sp.set("bgL2b", String(bgL2b));
      sp.set("t2bfs", String(tagFs2b));
      sp.set("s2bl", slide2bLogoLeft ? "1" : "0");
    }
    return `/api/tools/download-slide?${sp.toString()}`;
  };

  const onUpscale = async () => {
    if (upscale.state === "running") return;
    const startedAt = Date.now();
    setUpscale({
      state: "running",
      message:
        "Running Real-ESRGAN ×2 on Replicate (typically 10–30s, sometimes longer)…",
    });
    try {
      const resp = await fetch("/api/tools/upscale-hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: heroSrc }),
      });
      const data = (await resp.json()) as { url?: string; error?: string };
      if (!resp.ok || !data.url) {
        setUpscale({
          state: "error",
          message: `Upscale failed: ${data.error ?? resp.statusText}`,
        });
        return;
      }
      setHeroSrc(data.url);
      setPosA({ x: 50, y: 50, zoom: 1 });
      setPosC({ x: 50, y: 50, zoom: 1 });
      setUpscale({
        state: "done",
        message: `Upscaled in ${Math.round((Date.now() - startedAt) / 1000)}s · source replaced, zoom reset to 100%`,
      });
    } catch (e) {
      setUpscale({
        state: "error",
        message: `Upscale error: ${(e as Error).message}`,
      });
    }
  };

  // Effective stories come straight from the picker. If the user hasn't
  // picked any yet, the templates render placeholder card backgrounds — far
  // better than silently falling back to hardcoded URLs from a different
  // issue, which is what the prior STORY_IMAGES + STORY_TITLES constants did.
  const effectiveStories: Story[] = storyPicks;

  // Curator fetch state
  const [curatorState, setCuratorState] = useState<{
    state: "idle" | "loading" | "loaded" | "error";
    issue?: {
      number: number;
      name: string;
      publicationDate?: string;
      summary?: string;
      theme?: string;
      leadImageUrl?: string;
    };
    entries?: { id: string; title: string; sourceUrl: string; imageUrl: string | null }[];
    error?: string;
  }>({ state: "idle" });

  const fetchIssue = async () => {
    setCuratorState({ state: "loading" });
    try {
      const resp = await fetch(`/api/tools/curator-issue/${issueNumber}`);
      const data = await resp.json();
      if (!resp.ok) {
        setCuratorState({ state: "error", error: data.error ?? "fetch failed" });
        return;
      }
      setCuratorState({ state: "loaded", issue: data.issue, entries: data.entries });
      // Drive every slide off the fetched issue. Any field the Curator doesn't
      // supply falls back to the previous value (brand/brandLong are project-
      // scoped and never come from Curator).
      if (data.issue) {
        const formattedDate = formatPublicationDate(data.issue.publicationDate);
        const next: IssueData = {
          number: data.issue.number ?? issueNumber,
          date: formattedDate ?? issueData.date,
          brand: issueData.brand,
          brandLong: issueData.brandLong,
          tagline:
            data.issue.theme ||
            data.issue.summary ||
            data.issue.name ||
            issueData.tagline,
          leadImageUrl: data.issue.leadImageUrl || issueData.leadImageUrl,
        };
        setIssueData(next);
        if (data.issue.leadImageUrl) {
          setHeroSrc(data.issue.leadImageUrl);
          // Reset image pan/zoom so a brand-new hero starts centered.
          setPosA({ x: 50, y: 50, zoom: 1 });
          setPosC({ x: 50, y: 50, zoom: 1 });
        }
        // Story picks from the prior issue don't apply to the new one.
        setStoryPicks([]);
      }
    } catch (e) {
      setCuratorState({ state: "error", error: (e as Error).message });
    }
  };

  const toggleStory = (entry: {
    title: string;
    imageUrl: string | null;
  }) => {
    const idx = storyPicks.findIndex((s) => s.title === entry.title);
    if (idx >= 0) {
      setStoryPicks(storyPicks.filter((_, i) => i !== idx));
    } else if (storyPicks.length < 4) {
      setStoryPicks([...storyPicks, entry]);
    }
  };

  // Render mode: just a single slide at native 1080×1350 with no chrome,
  // for Puppeteer to screenshot as PNG.
  if (renderSlide) {
    let node: React.ReactNode = null;
    if (renderSlide === "A")
      node = (
        <TemplateA
          heroSrc={heroSrc}
          imagePos={posA}
          onChange={setPosA}
          bandFinalColor={finalHex}
          bandBlur={bandBlurA}
          taglineFontSize={taglineFsA}
          cta={slide1Cta}
          numeralLeft={slide1NumeralLeft}
          numeralLight={slide1NumeralLight}
          numeralOpacity={slide1NumeralOpacity}
          issueNumber={issueData.number}
          brand={issueData.brand}
          tagline={issueData.tagline}
          date={issueData.date}
        />
      );
    else if (renderSlide === "2a")
      node = (
        <TemplateB_Square
          numeralPos={numeralA}
          onNumeralChange={setNumeralA}
          stories={
            format === "li"
              ? effectiveStories.slice(0, 2)
              : effectiveStories.slice(0, 4)
          }
          tagline={issueData.tagline}
          bgColor={bgFinal2a}
          taglineFontSize={tagFs2a}
          cta={slide2Cta}
          logoLeft={slide2aLogoLeft}
          issueNumber={issueData.number}
          brandLong={issueData.brandLong}
          date={issueData.date}
        />
      );
    else if (renderSlide === "2b")
      node =
        format === "li" ? (
          <TemplateB_Square
            numeralPos={numeralB}
            onNumeralChange={setNumeralB}
            stories={effectiveStories.slice(2, 4)}
            tagline={issueData.tagline}
            bgColor={bgFinal2b}
            taglineFontSize={tagFs2b}
            cta={slide2Cta}
            logoLeft={slide2bLogoLeft}
            issueNumber={issueData.number}
            brandLong={issueData.brandLong}
            date={issueData.date}
          />
        ) : (
          <TemplateB_Rect
            numeralPos={numeralB}
            onNumeralChange={setNumeralB}
            stories={effectiveStories.slice(0, 4)}
            tagline={issueData.tagline}
            bgColor={bgFinal2b}
            taglineFontSize={tagFs2b}
            cta={slide2Cta}
            logoLeft={slide2bLogoLeft}
            issueNumber={issueData.number}
            brandLong={issueData.brandLong}
            date={issueData.date}
          />
        );
    else if (renderSlide === "C")
      node = (
        <TemplateC
          heroSrc={heroSrc}
          imagePos={posC}
          onChange={setPosC}
          taglineFontSize={taglineFsC}
          cta={slide3Cta}
          issueNumber={issueData.number}
          brand={issueData.brand}
          tagline={issueData.tagline}
          date={issueData.date}
        />
      );
    return (
      <SizeContext.Provider value={currentSize}>
        {/* In render mode the page is screenshotted by Puppeteer for PNG/PDF
            export. Hide the Next.js dev indicator (the floating "N" + status
            icon — both live inside <nextjs-portal>'s shadow DOM) so they
            don't bleed into the saved artifact. */}
        <style>{`
          html, body { margin: 0; padding: 0; background: #000; overflow: hidden; }
          nextjs-portal { display: none !important; }
        `}</style>
        <div
          id="render-root"
          style={{
            width: currentSize.w,
            height: currentSize.h,
            position: "absolute",
            top: 0,
            left: 0,
            margin: 0,
            padding: 0,
            background: "#000",
          }}
        >
          {node}
        </div>
      </SizeContext.Provider>
    );
  }

  return (
    <SizeContext.Provider value={currentSize}>
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Overview Cover Generator</h1>
        <p className="text-sm text-muted-foreground">
          Render the 3 carousel slides for an Intersect newsletter Overview
          post. Instagram 4:5 (1080×1350) or LinkedIn 1:1 (1080×1080) — toggle
          below. Drag images to reposition, drag the 74 to nudge it, tune
          colors and tagline sizes per slide. Click <strong>↓ Download PNG</strong>{" "}
          for individual slides or <strong>↓ Download PDF</strong> for the
          full 3-slide carousel.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4 border border-border rounded bg-muted/30 max-w-3xl">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            Intersect issue
          </span>
          <input
            type="number"
            value={issueNumber}
            onChange={(e) => setIssueNumber(Number(e.target.value))}
            className="w-20 px-2 py-1 border border-border rounded text-sm"
          />
          <button
            type="button"
            onClick={fetchIssue}
            disabled={curatorState.state === "loading"}
            className="px-3 py-1.5 border border-border rounded text-xs bg-foreground text-background hover:opacity-80 disabled:opacity-50"
          >
            {curatorState.state === "loading"
              ? "Loading…"
              : "Fetch issue + stories"}
          </button>
          <div className="flex items-center gap-1 ml-2 border border-border rounded p-0.5">
            <button
              type="button"
              onClick={() => setFormat("ig")}
              className={`px-2 py-1 text-xs rounded ${
                format === "ig"
                  ? "bg-foreground text-background"
                  : "hover:bg-muted"
              }`}
              title="Instagram 4:5 (1080×1350)"
            >
              IG 4:5
            </button>
            <button
              type="button"
              onClick={() => setFormat("li")}
              className={`px-2 py-1 text-xs rounded ${
                format === "li"
                  ? "bg-foreground text-background"
                  : "hover:bg-muted"
              }`}
              title="LinkedIn document carousel 1:1 (1080×1080)"
            >
              LI 1:1
            </button>
          </div>
          <PdfDownloadButton
            href={(() => {
              const sp = new URLSearchParams();
              sp.set("slides", "A,2a,C");
              sp.set("fmt", format);
              sp.set("hero", heroSrc);
              sp.set("n", String(issueData.number));
              sp.set("dt", issueData.date);
              sp.set("br", issueData.brand);
              sp.set("bln", issueData.brandLong);
              sp.set("tg", issueData.tagline);
              if (storyPicks.length > 0) {
                sp.set("sp", JSON.stringify(storyPicks));
              }
              sp.set("ax", String(posA.x));
              sp.set("ay", String(posA.y));
              sp.set("az", String(posA.zoom));
              if (bandColorOverrideA) sp.set("bc", bandColorOverrideA);
              sp.set("bl", String(bandLightnessA));
              sp.set("bb", String(bandBlurA));
              sp.set("cx", String(posC.x));
              sp.set("cy", String(posC.y));
              sp.set("cz", String(posC.zoom));
              sp.set("nafs", String(numeralA.fontSize));
              sp.set("nadx", String(numeralA.dx));
              sp.set("nady", String(numeralA.dy));
              sp.set("nbfs", String(numeralB.fontSize));
              sp.set("nbdx", String(numeralB.dx));
              sp.set("nbdy", String(numeralB.dy));
              sp.set("tafs", String(taglineFsA));
              sp.set("tcfs", String(taglineFsC));
              if (slide1NumeralLeft) sp.set("s1l", "1");
              sp.set("s1nl", slide1NumeralLight ? "1" : "0");
              sp.set("s1no", String(slide1NumeralOpacity));
              sp.set("s2al", slide2aLogoLeft ? "1" : "0");
              sp.set("s2bl", slide2bLogoLeft ? "1" : "0");
              return `/api/tools/download-pdf?${sp.toString()}`;
            })()}
            filename={`intersect-issue-${issueData.number}-overview-${format}.pdf`}
          />
          {curatorState.state === "loaded" && curatorState.issue && (
            <span className="text-xs text-muted-foreground">
              · {curatorState.issue.name} · {curatorState.entries?.length ?? 0}{" "}
              entries
            </span>
          )}
          {curatorState.state === "error" && (
            <span className="text-xs text-red-600">
              {curatorState.error}
            </span>
          )}
          {storyPicks.length > 0 && (
            <button
              type="button"
              onClick={() => setStoryPicks([])}
              className="text-xs underline opacity-70 hover:opacity-100 ml-auto"
            >
              clear story picks ({storyPicks.length}/4)
            </button>
          )}
        </div>

        {storyPicks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-muted-foreground">
              Selected story order — drag to reorder, ✕ to remove:
            </div>
            <SelectedStoryRow picks={storyPicks} onChange={setStoryPicks} />
          </div>
        )}

        {curatorState.state === "loaded" && curatorState.entries && (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">
              Pick up to 4 stories for the Slide 2 grid (click to toggle):
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {curatorState.entries.map((e) => {
                const picked = storyPicks.some((s) => s.title === e.title);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() =>
                      toggleStory({
                        title: e.title,
                        imageUrl: e.imageUrl,
                      })
                    }
                    className={`flex gap-2 p-2 border rounded text-left text-xs hover:bg-muted ${
                      picked
                        ? "border-foreground bg-foreground/10 ring-2 ring-foreground"
                        : "border-border"
                    }`}
                  >
                    <div className="w-16 h-16 shrink-0 bg-black/10 rounded overflow-hidden">
                      {e.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={e.imageUrl}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      )}
                    </div>
                    <div className="flex-1 leading-tight">{e.title}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-8">
        <div className="flex flex-col gap-2">
          <CanvasFrame label="Slide 1 — Cover (sampled bottom band)">
            <TemplateA
              heroSrc={heroSrc}
              imagePos={posA}
              onChange={setPosA}
              bandFinalColor={finalHex}
              bandBlur={bandBlurA}
              taglineFontSize={taglineFsA}
              cta={slide1Cta}
              numeralLeft={slide1NumeralLeft}
              numeralLight={slide1NumeralLight}
              numeralOpacity={slide1NumeralOpacity}
              issueNumber={issueData.number}
              brand={issueData.brand}
              tagline={issueData.tagline}
              date={issueData.date}
            />
          </CanvasFrame>
          <DownloadButton href={buildDownloadHref("A")} filename={`intersect-issue-${issueData.number}-cover.png`} />
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground flex-wrap" style={{ width: DISPLAY_W }}>
            <button
              type="button"
              onClick={() => setSlide1NumeralLeft(!slide1NumeralLeft)}
              className="px-2 py-1 border border-border rounded hover:bg-muted"
              title="Swap which side the issue numeral sits on (masthead text follows)"
            >
              {slide1NumeralLeft ? "↔ Move to right" : "↔ Move to left"}
            </button>
            <button
              type="button"
              onClick={() => setSlide1NumeralLight(!slide1NumeralLight)}
              className="px-2 py-1 border border-border rounded hover:bg-muted"
              title="Toggle numeral color: light (white) over dark photos, dark (black) over light photos"
            >
              {slide1NumeralLight ? "◐ Dark" : "◑ Light"}
            </button>
            <span className="inline-flex items-center gap-1">
              <span className="opacity-70">Opacity</span>
              <button
                type="button"
                onClick={() =>
                  setSlide1NumeralOpacity(
                    Math.max(0, slide1NumeralOpacity - 5),
                  )
                }
                className="px-1.5 py-0.5 border border-border rounded hover:bg-muted"
                title="Decrease numeral opacity by 5%"
              >
                −
              </button>
              <span className="w-9 text-center tabular-nums">
                {slide1NumeralOpacity}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setSlide1NumeralOpacity(
                    Math.min(100, slide1NumeralOpacity + 5),
                  )
                }
                className="px-1.5 py-0.5 border border-border rounded hover:bg-muted"
                title="Increase numeral opacity by 5%"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setSlide1NumeralOpacity(18)}
                className="text-[10px] underline opacity-60 hover:opacity-100 ml-1"
                title="Reset opacity to 18%"
              >
                reset
              </button>
            </span>
          </div>
          <NumberStepper label="Tagline" value={taglineFsA} onChange={setTaglineFsA} step={5} min={20} />
          <ImageEditorControls
            imagePos={posA}
            onChange={setPosA}
            bandColor={bandColorOverrideA}
            onBandColorChange={setBandColorOverrideA}
            onResetBand={onResetBand}
            bandColorSampled={sampledHex}
            bandLightness={bandLightnessA}
            onBandLightnessChange={setBandLightnessA}
            bandBlur={bandBlurA}
            onBandBlurChange={setBandBlurA}
            bandFinalColor={finalHex}
            onUpscale={onUpscale}
            upscaleStatus={upscale}
          />
        </div>

        <div className="flex flex-col gap-2">
          <CanvasFrame
            label={
              format === "li"
                ? "Slide 2a — Inner cover · stories 1–2"
                : "Slide 2a — Inner cover · square mark"
            }
          >
            <TemplateB_Square
              numeralPos={numeralA}
              onNumeralChange={setNumeralA}
              stories={
                format === "li"
                  ? effectiveStories.slice(0, 2)
                  : effectiveStories.slice(0, 4)
              }
              tagline={issueData.tagline}
              bgColor={bgFinal2a}
              taglineFontSize={tagFs2a}
              cta={slide2Cta}
              logoLeft={slide2aLogoLeft}
              issueNumber={issueData.number}
              brandLong={issueData.brandLong}
              date={issueData.date}
            />
          </CanvasFrame>
          <DownloadButton href={buildDownloadHref("2a")} filename={`intersect-issue-${issueData.number}-inner-2a.png`} />
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground" style={{ width: DISPLAY_W }}>
            <button
              type="button"
              onClick={() => setSlide2aLogoLeft(!slide2aLogoLeft)}
              className="px-2 py-1 border border-border rounded hover:bg-muted"
              title="Swap logo and numeral sides"
            >
              {slide2aLogoLeft ? "↔ Move logo to right" : "↔ Move logo to left"}
            </button>
            <span className="opacity-60">
              logo currently {slide2aLogoLeft ? "left" : "right"}
            </span>
          </div>
          <NumeralControls
            label="Slide 2a · 74"
            value={numeralA}
            onChange={setNumeralA}
            onReset={() => setNumeralA({ fontSize: 265, dx: -29, dy: -48 })}
          />
          <BgTaglineControls
            label="Slide 2a"
            bgColor={bg2a}
            onBgColorChange={setBg2a}
            bgLightness={bgL2a}
            onBgLightnessChange={setBgL2a}
            bgFinalColor={bgFinal2a}
            taglineFontSize={tagFs2a}
            onTaglineFontSizeChange={setTagFs2a}
            onReset={() => {
              setBg2a(null);
              setBgL2a(0);
              setTagFs2a(50);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <CanvasFrame
            label={
              format === "li"
                ? "Slide 2b — Inner cover · stories 3–4"
                : "Slide 2b — Inner cover · large rect logo"
            }
          >
            {format === "li" ? (
              <TemplateB_Square
                numeralPos={numeralB}
                onNumeralChange={setNumeralB}
                stories={effectiveStories.slice(2, 4)}
                tagline={issueData.tagline}
                bgColor={bgFinal2b}
                taglineFontSize={tagFs2b}
                cta={slide2Cta}
                logoLeft={slide2bLogoLeft}
                issueNumber={issueData.number}
                brandLong={issueData.brandLong}
                date={issueData.date}
              />
            ) : (
              <TemplateB_Rect
                numeralPos={numeralB}
                onNumeralChange={setNumeralB}
                stories={effectiveStories.slice(0, 4)}
                tagline={issueData.tagline}
                bgColor={bgFinal2b}
                taglineFontSize={tagFs2b}
                cta={slide2Cta}
                logoLeft={slide2bLogoLeft}
                issueNumber={issueData.number}
                brandLong={issueData.brandLong}
                date={issueData.date}
              />
            )}
          </CanvasFrame>
          <DownloadButton href={buildDownloadHref("2b")} filename={`intersect-issue-${issueData.number}-inner-2b.png`} />
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground" style={{ width: DISPLAY_W }}>
            <button
              type="button"
              onClick={() => setSlide2bLogoLeft(!slide2bLogoLeft)}
              className="px-2 py-1 border border-border rounded hover:bg-muted"
              title="Swap logo and numeral sides"
            >
              {slide2bLogoLeft ? "↔ Move logo to right" : "↔ Move logo to left"}
            </button>
            <span className="opacity-60">
              logo currently {slide2bLogoLeft ? "left" : "right"}
            </span>
          </div>
          <NumeralControls
            label="Slide 2b · 74"
            value={numeralB}
            onChange={setNumeralB}
            onReset={() => setNumeralB({ fontSize: 225, dx: -11, dy: -41 })}
          />
          <BgTaglineControls
            label="Slide 2b"
            bgColor={bg2b}
            onBgColorChange={setBg2b}
            bgLightness={bgL2b}
            onBgLightnessChange={setBgL2b}
            bgFinalColor={bgFinal2b}
            taglineFontSize={tagFs2b}
            onTaglineFontSizeChange={setTagFs2b}
            onReset={() => {
              setBg2b(null);
              setBgL2b(0);
              setTagFs2b(44);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <CanvasFrame label="Slide 3 — CTA (full-bleed)">
            <TemplateC
              heroSrc={heroSrc}
              imagePos={posC}
              onChange={setPosC}
              taglineFontSize={taglineFsC}
              cta={slide3Cta}
              issueNumber={issueData.number}
              brand={issueData.brand}
              tagline={issueData.tagline}
              date={issueData.date}
            />
          </CanvasFrame>
          <DownloadButton href={buildDownloadHref("C")} filename={`intersect-issue-${issueData.number}-cta.png`} />
          <NumberStepper label="Tagline" value={taglineFsC} onChange={setTaglineFsC} step={5} min={20} />
          <ImageEditorControls
            imagePos={posC}
            onChange={setPosC}
            onUpscale={onUpscale}
            upscaleStatus={upscale}
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground max-w-3xl pt-4 border-t">
        Currently scoped to The Intersect — issue data is fetched from the
        Intersect Curator base, brand logos are hardcoded. To support other
        newsletters, parameterize the brand selector + story-source adapter.
      </div>
    </div>
    </SizeContext.Provider>
  );
}

export default function CoverGeneratorPage() {
  return (
    <Suspense fallback={null}>
      <OverviewCoversDevPage />
    </Suspense>
  );
}
