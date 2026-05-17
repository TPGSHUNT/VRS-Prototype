'use client';

// Vendor bubble field — DETERMINISTIC layout (docs/21, decided 2026-05-17).
// No force simulation, no collision: position is a pure computed pass from
// the selected metrics, so it renders instantly at any N and never "dances".
// Bubbles MAY overlap — co-located bubbles mean co-located data, which is
// truthful; a user-drawn exploder (later) is the only thing that separates
// them, on demand. Position = rank-percentile on X/Y (median-centered);
// size = sqrt(value) so area is proportional; colour = attention health.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  METRIC_FORMAT,
  METRIC_LABELS,
  type BubbleVendor,
  type MetricKey,
} from '@/lib/bubble-data';

type BubbleHealthShort = BubbleVendor['health'];

interface PositionedNode extends BubbleVendor {
  radius: number;
  x: number;
  y: number;
}

const HEALTH_FILL: Record<BubbleHealthShort, string> = {
  GREEN: 'rgb(34, 197, 94)',
  AMBER: 'rgb(245, 158, 11)',
  RED: 'rgb(239, 68, 68)',
};
const HALO_STROKE = 'rgb(59, 130, 246)';

const MIN_RADIUS = 6;
const MAX_RADIUS = 54;
// Below this radius the inner name label is dropped (unreadable + keeps the
// DOM light when the estate has thousands of bubbles). Full name on hover.
const LABEL_MIN_RADIUS = 17;
const PADDING = { left: 70, right: 170, top: 110, bottom: 110 };

function fmtSuffix(k: MetricKey): string {
  const f = METRIC_FORMAT[k];
  return f === 'money'
    ? '($ · by rank)'
    : f === 'percent'
      ? '(% · by rank)'
      : '(count · by rank)';
}

interface BubbleFieldProps {
  vendors: BubbleVendor[];
  xMetric: MetricKey;
  yMetric: MetricKey;
  sizeMetric: MetricKey;
  onSelect?: (vendorId: string) => void;
}

export function BubbleField({
  vendors,
  xMetric,
  yMetric,
  sizeMetric,
  onSelect,
}: BubbleFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    id: string;
    name: string;
    queuePending: boolean;
  } | null>(null);

  // Pan + zoom viewport (k = scale, tx/ty = translate in screen px). Applied
  // to the plot group only; axis labels + legend stay fixed. Hand-rolled —
  // AppShell is overflow-hidden so wheel never scrolls the page.
  const [vp, setVp] = useState({ k: 1, tx: 0, ty: 0 });
  const panRef = useRef<{
    startX: number;
    startY: number;
    tx: number;
    ty: number;
  } | null>(null);
  const MIN_K = 0.4;
  const MAX_K = 8;
  const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

  function onWheel(e: React.WheelEvent) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setVp((p) => {
      const k2 = clampK(p.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      const ratio = k2 / p.k;
      return {
        k: k2,
        tx: px - ratio * (px - p.tx),
        ty: py - ratio * (py - p.ty),
      };
    });
  }
  function onPanDown(e: React.PointerEvent) {
    // Only the background rect starts a pan (bubbles handle their own events).
    if ((e.target as Element).getAttribute('data-bg') !== '1') return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      tx: vp.tx,
      ty: vp.ty,
    };
  }
  function onPanMove(e: React.PointerEvent) {
    const s = panRef.current;
    if (!s) return;
    setVp((p) => ({
      ...p,
      tx: s.tx + (e.clientX - s.startX),
      ty: s.ty + (e.clientY - s.startY),
    }));
  }
  function onPanUp() {
    panRef.current = null;
  }
  const zoomBy = (f: number) =>
    setVp((p) => {
      const k2 = clampK(p.k * f);
      const cx = size.width / 2;
      const cy = size.height / 2;
      const ratio = k2 / p.k;
      return {
        k: k2,
        tx: cx - ratio * (cx - p.tx),
        ty: cy - ratio * (cy - p.ty),
      };
    });
  const resetView = () => setVp({ k: 1, tx: 0, ty: 0 });

  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);

  // Entrance: read the empty quadrant frame first, then bubbles fade in.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 450);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Deterministic layout. Rank-percentile on each axis so the median lands
  // at the visual centre regardless of skew and the field uses the whole
  // viewport. No simulation, no collide — overlaps are allowed and meaningful.
  const { xCenter, yCenter, nodes } = useMemo(() => {
    if (!size.width || !size.height || vendors.length === 0) {
      return { xCenter: 0, yCenter: 0, nodes: [] as PositionedNode[] };
    }
    const innerWidth = size.width - PADDING.left - PADDING.right;
    const innerHeight = size.height - PADDING.top - PADDING.bottom;
    const xCenter = PADDING.left + innerWidth / 2;
    const yCenter = PADDING.top + innerHeight / 2;

    const ranks = (key: MetricKey) => {
      const sorted = [...vendors].sort(
        (a, b) => a.metrics[key] - b.metrics[key],
      );
      const m = new Map<string, number>();
      sorted.forEach((v, i) => m.set(v.id, (i + 0.5) / sorted.length));
      return m;
    };
    const xR = ranks(xMetric);
    const yR = ranks(yMetric);

    const sizeMax = Math.max(
      ...vendors.map((v) => Math.max(v.metrics[sizeMetric], 0)),
      1,
    );

    const nodes: PositionedNode[] = vendors.map((v) => {
      const t = Math.sqrt(Math.max(v.metrics[sizeMetric], 0) / sizeMax);
      return {
        ...v,
        radius: MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS),
        x: PADDING.left + (xR.get(v.id) ?? 0.5) * innerWidth,
        // Y inverted: rank 1 (largest) at top.
        y: PADDING.top + (1 - (yR.get(v.id) ?? 0.5)) * innerHeight,
      };
    });
    // Largest first so big bubbles paint under small ones (small stay
    // clickable on top); hovered node is lifted at render time.
    nodes.sort((a, b) => b.radius - a.radius);
    return { xCenter, yCenter, nodes };
  }, [vendors, xMetric, yMetric, sizeMetric, size.width, size.height]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      onWheel={onWheel}
      onPointerMove={onPanMove}
      onPointerUp={onPanUp}
      onPointerLeave={onPanUp}
    >
      <svg width="100%" height="100%" className="block">
        <style>{`
          @keyframes vrs-halo-pulse {
            0%, 100% { opacity: 0.65; transform: scale(1); }
            50% { opacity: 0.2; transform: scale(1.18); }
          }
          .vrs-halo {
            animation: vrs-halo-pulse 1.8s ease-in-out infinite;
            transform-origin: center;
            transform-box: fill-box;
          }
        `}</style>

        {/* Pan surface — clicking empty space + dragging pans; bubbles
            handle their own pointer events and never start a pan. */}
        <rect
          data-bg="1"
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill="transparent"
          onPointerDown={onPanDown}
          style={{ cursor: 'grab' }}
        />

        {/* Quadrant watermarks (fixed — ambient context, not zoomed) */}
        {size.width > 0 &&
          (() => {
            const xLabel = METRIC_LABELS[xMetric];
            const yLabel = METRIC_LABELS[yMetric];
            const innerLeft = PADDING.left;
            const innerRight = size.width - PADDING.right;
            const innerTop = PADDING.top;
            const innerBottom = size.height - PADDING.bottom;
            const tlX = (innerLeft + xCenter) / 2;
            const trX = (xCenter + innerRight) / 2;
            const topY = (innerTop + yCenter) / 2;
            const botY = (yCenter + innerBottom) / 2;
            const titleStyle: React.CSSProperties = {
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            };
            const subStyle: React.CSSProperties = {
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            };
            const Watermark = ({
              x,
              y,
              yWord,
              xWord,
            }: {
              x: number;
              y: number;
              yWord: 'High' | 'Low';
              xWord: 'High' | 'Low';
            }) => (
              <g transform={`translate(${x},${y})`} pointerEvents="none">
                <text
                  textAnchor="middle"
                  className="fill-gray-300"
                  style={titleStyle}
                >
                  {yWord} {yLabel}
                </text>
                <text
                  textAnchor="middle"
                  y={18}
                  className="fill-gray-300"
                  style={subStyle}
                >
                  {xWord} {xLabel}
                </text>
              </g>
            );
            return (
              <g
                style={{
                  opacity: entered ? 0.45 : 1,
                  transition: 'opacity 700ms ease',
                }}
              >
                <Watermark x={tlX} y={topY} yWord="High" xWord="Low" />
                <Watermark x={trX} y={topY} yWord="High" xWord="High" />
                <Watermark x={tlX} y={botY} yWord="Low" xWord="Low" />
                <Watermark x={trX} y={botY} yWord="Low" xWord="High" />
              </g>
            );
          })()}

        {/* Plot group — pan/zoom transform applies here (crosshairs move
            with the data so the median reference stays meaningful). */}
        <g transform={`translate(${vp.tx},${vp.ty}) scale(${vp.k})`}>
        {/* Crosshairs at chart centre (median lands here under rank scaling) */}
        {size.width > 0 && (
          <>
            <line
              x1={xCenter}
              y1={PADDING.top}
              x2={xCenter}
              y2={size.height - PADDING.bottom}
              stroke="rgb(156, 163, 175)"
              strokeWidth={1.25}
              strokeDasharray="5 5"
            />
            <line
              x1={PADDING.left}
              y1={yCenter}
              x2={size.width - PADDING.right}
              y2={yCenter}
              stroke="rgb(156, 163, 175)"
              strokeWidth={1.25}
              strokeDasharray="5 5"
            />
          </>
        )}
        </g>

        {/* Axis labels (fixed — frame the field, not zoomed) */}
        {size.width > 0 && (
          <>
            <text
              x={size.width / 2}
              y={size.height - 18}
              textAnchor="middle"
              className="fill-gray-600"
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              X · {METRIC_LABELS[xMetric]} {fmtSuffix(xMetric)} →
            </text>
            <text
              transform={`translate(20, ${size.height / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-gray-600"
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Y · {METRIC_LABELS[yMetric]} {fmtSuffix(yMetric)} →
            </text>
          </>
        )}

        {/* Bubbles — static, deterministic, overlap allowed. Pan/zoom
            transform mirrors the crosshair group. */}
        <g transform={`translate(${vp.tx},${vp.ty}) scale(${vp.k})`}>
        <g
          style={{
            opacity: entered ? 1 : 0,
            transition: 'opacity 550ms ease',
          }}
        >
          {nodes.map((node) => {
            const isHovered = hoveredId === node.id;
            const showLabel = node.radius >= LABEL_MIN_RADIUS;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={isHovered ? { isolation: 'isolate' } : undefined}
              >
                {node.queuePending && (
                  <circle
                    r={node.radius + 8}
                    fill="none"
                    stroke={HALO_STROKE}
                    strokeWidth={2.5}
                    className="vrs-halo"
                    pointerEvents="none"
                  />
                )}
                <circle
                  r={node.radius}
                  fill={HEALTH_FILL[node.health]}
                  opacity={isHovered ? 1 : 0.78}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelect?.(node.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({
                      x: e.clientX,
                      y: e.clientY,
                      id: node.id,
                      name: node.name,
                      queuePending: node.queuePending,
                    });
                  }}
                  style={{
                    filter: isHovered
                      ? 'drop-shadow(0 6px 16px rgba(0,0,0,0.3))'
                      : 'none',
                    transform: isHovered ? 'scale(1.12)' : 'scale(1)',
                    transformOrigin: 'center',
                    transformBox: 'fill-box',
                    transition:
                      'transform 200ms ease, filter 200ms ease, opacity 200ms ease',
                    cursor: 'pointer',
                  }}
                />
                {showLabel && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents="none"
                    fill="white"
                    style={{
                      fontSize: Math.max(9, Math.min(node.radius / 4.2, 13)),
                      fontWeight: 600,
                      letterSpacing: '0.01em',
                      userSelect: 'none',
                    }}
                  >
                    {compactName(node.name)}
                  </text>
                )}
                {isHovered && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    y={node.radius + 16}
                    pointerEvents="none"
                    className="fill-gray-900"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      paintOrder: 'stroke',
                      stroke: 'white',
                      strokeWidth: 4,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                    }}
                  >
                    {node.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        </g>
      </svg>

      {/* Health legend */}
      <div className="absolute top-3 right-3 bg-white/85 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
        <div className="font-medium text-gray-700 mb-1.5">Attention</div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Behind on a
            closed period
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />{' '}
            Post-final adjustment
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Clear
          </span>
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-500 inline-block" />
            Pending AP approval
          </span>
        </div>
      </div>

      {/* Zoom controls (pan = drag empty space; wheel = zoom to cursor) */}
      <div className="absolute top-3 left-3 flex flex-col gap-1">
        <div className="flex flex-col rounded-lg border border-gray-200 bg-white/85 backdrop-blur-sm shadow-sm overflow-hidden">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.3)}
            className="px-2.5 py-1.5 text-gray-700 hover:bg-gray-100 text-sm font-semibold border-b border-gray-200"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.3)}
            className="px-2.5 py-1.5 text-gray-700 hover:bg-gray-100 text-sm font-semibold border-b border-gray-200"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Reset view"
            onClick={resetView}
            className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-gray-500 hover:bg-gray-100"
          >
            {vp.k === 1 && vp.tx === 0 && vp.ty === 0
              ? 'Fit'
              : `${vp.k.toFixed(1)}×`}
          </button>
        </div>
        <span className="text-[10px] text-gray-400 max-w-[120px] leading-tight">
          drag to pan · scroll to zoom
        </span>
      </div>

      {/* Right-click context menu (P1.2) */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div
            role="menu"
            className="fixed z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl text-sm"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 220),
              top: Math.min(ctxMenu.y, window.innerHeight - 180),
            }}
          >
            <div className="truncate px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100">
              {ctxMenu.name}
            </div>
            <CtxItem
              onClick={() => {
                onSelect?.(ctxMenu.id);
                setCtxMenu(null);
              }}
            >
              Open record
            </CtxItem>
            <CtxItem soon="Phase 3">Run report</CtxItem>
            <CtxItem soon="Phase 2">Ask Vera</CtxItem>
            {ctxMenu.queuePending && (
              <CtxItem soon="soon">Approve in queue</CtxItem>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CtxItem({
  children,
  onClick,
  soon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  soon?: string;
}) {
  const disabled = !!soon;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={
        'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left ' +
        (disabled
          ? 'cursor-not-allowed text-gray-400'
          : 'text-gray-800 hover:bg-blue-50 hover:text-blue-700')
      }
    >
      <span>{children}</span>
      {soon && (
        <span className="rounded bg-gray-100 px-1.5 text-[10px] uppercase tracking-wide text-gray-400">
          {soon}
        </span>
      )}
    </button>
  );
}

function compactName(raw: string): string {
  const cleaned = raw
    .replace(
      /\b(LLC|INC|CORP|CO|EDI|CORPORATE|COMPANY|US|USA|NORTH AMERICA|GLOBAL)\b/g,
      '',
    )
    .replace(/[\.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0) return raw.slice(0, 12);
  if (words.length === 1) return words[0]!.slice(0, 14);
  return (words[0] + ' ' + (words[1] ?? '')).slice(0, 14);
}
