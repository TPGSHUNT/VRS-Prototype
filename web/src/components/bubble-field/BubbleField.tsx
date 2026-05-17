'use client';

// Vendor bubble field — the "now"-anchored semantic encoding (docs/21 §9).
// THREE fixed-semantic dimensions, no X/Y/Size pickers:
//   • Materiality → vertical position AND bubble size (reinforced)
//   • Performance → horizontal position (contraction ← centre → growth)
//   • Attention   → colour
// Deterministic layout: no force sim, no collision; overlap is truthful;
// pan/zoom; the user-drawn exploder (later) is the only de-overlap.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BubbleHealth } from '@/lib/bubble-data';

export interface FieldNode {
  id: string;
  name: string;
  vendorNumber: number;
  materiality: number; // 0..1 (normalized across the render set)
  performancePctl: number; // 0..1 (0.5 ≈ flat)
  performanceRaw: number; // signed YoY fraction (for label)
  attention: { level: BubbleHealth; reasons: string[]; stake: number };
  queuePending: boolean;
  attribution: string[]; // "why this size" + attention, for hover
  isCluster?: boolean; // aggregate node (estate drill-down, docs/21 §8.2)
  count?: number; // members, when isCluster
}

const HEALTH_FILL: Record<BubbleHealth, string> = {
  GREEN: 'rgb(34, 197, 94)',
  AMBER: 'rgb(245, 158, 11)',
  RED: 'rgb(239, 68, 68)',
};
const HALO_STROKE = 'rgb(59, 130, 246)';
const MIN_RADIUS = 6;
const MAX_RADIUS = 54;
const LABEL_MIN_RADIUS = 17;
const PADDING = { left: 70, right: 170, top: 110, bottom: 110 };

interface BubbleFieldProps {
  nodes: FieldNode[];
  onSelect?: (vendorId: string) => void;
}

export function BubbleField({ nodes: input, onSelect }: BubbleFieldProps) {
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

  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);

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

  // Pan + zoom viewport.
  const [vp, setVp] = useState({ k: 1, tx: 0, ty: 0 });
  const panRef = useRef<{
    startX: number;
    startY: number;
    tx: number;
    ty: number;
  } | null>(null);
  const clampK = (k: number) => Math.min(8, Math.max(0.4, k));
  function onWheel(e: React.WheelEvent) {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    setVp((p) => {
      const k2 = clampK(p.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      const ratio = k2 / p.k;
      return { k: k2, tx: px - ratio * (px - p.tx), ty: py - ratio * (py - p.ty) };
    });
  }
  function onPanDown(e: React.PointerEvent) {
    if ((e.target as Element).getAttribute('data-bg') !== '1') return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    panRef.current = { startX: e.clientX, startY: e.clientY, tx: vp.tx, ty: vp.ty };
  }
  function onPanMove(e: React.PointerEvent) {
    const s = panRef.current;
    if (!s) return;
    setVp((p) => ({ ...p, tx: s.tx + (e.clientX - s.startX), ty: s.ty + (e.clientY - s.startY) }));
  }
  const onPanUp = () => {
    panRef.current = null;
  };
  const zoomBy = (f: number) =>
    setVp((p) => {
      const k2 = clampK(p.k * f);
      const cx = size.width / 2;
      const cy = size.height / 2;
      const ratio = k2 / p.k;
      return { k: k2, tx: cx - ratio * (cx - p.tx), ty: cy - ratio * (cy - p.ty) };
    });
  const resetView = () => setVp({ k: 1, tx: 0, ty: 0 });

  // Deterministic layout. Vertical = materiality (rank-percentile,
  // median-centred). Size = sqrt(materiality). Horizontal = performance
  // percentile (0.5 ≈ flat, left = contraction, right = growth).
  const { xCenter, yCenter, placed } = useMemo(() => {
    if (!size.width || !size.height || input.length === 0) {
      return { xCenter: 0, yCenter: 0, placed: [] as (FieldNode & { x: number; y: number; r: number })[] };
    }
    const iw = size.width - PADDING.left - PADDING.right;
    const ih = size.height - PADDING.top - PADDING.bottom;
    const xCenter = PADDING.left + iw / 2;
    const yCenter = PADDING.top + ih / 2;

    // Rank materiality for vertical position (median-centred spread).
    const byMat = [...input].sort((a, b) => a.materiality - b.materiality);
    const yr = new Map<string, number>();
    byMat.forEach((v, i) => yr.set(v.id, (i + 0.5) / byMat.length));

    const placed = input.map((v) => {
      const t = Math.sqrt(Math.max(v.materiality, 0));
      return {
        ...v,
        r: MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS),
        x: PADDING.left + Math.min(1, Math.max(0, v.performancePctl)) * iw,
        y: PADDING.top + (1 - (yr.get(v.id) ?? 0.5)) * ih,
      };
    });
    placed.sort((a, b) => b.r - a.r); // big under small (small clickable on top)
    return { xCenter, yCenter, placed };
  }, [input, size.width, size.height]);

  const T = `translate(${vp.tx},${vp.ty}) scale(${vp.k})`;

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

        {/* Quadrant watermarks (fixed) */}
        {size.width > 0 &&
          (() => {
            const il = PADDING.left;
            const ir = size.width - PADDING.right;
            const it = PADDING.top;
            const ib = size.height - PADDING.bottom;
            const tlX = (il + xCenter) / 2;
            const trX = (xCenter + ir) / 2;
            const topY = (it + yCenter) / 2;
            const botY = (yCenter + ib) / 2;
            const ts: React.CSSProperties = {
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            };
            const ss: React.CSSProperties = {
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            };
            const W = ({
              x,
              y,
              mat,
              perf,
            }: {
              x: number;
              y: number;
              mat: string;
              perf: string;
            }) => (
              <g transform={`translate(${x},${y})`} pointerEvents="none">
                <text textAnchor="middle" className="fill-gray-300" style={ts}>
                  {mat} materiality
                </text>
                <text
                  textAnchor="middle"
                  y={18}
                  className="fill-gray-300"
                  style={ss}
                >
                  {perf}
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
                <W x={tlX} y={topY} mat="High" perf="Contracting" />
                <W x={trX} y={topY} mat="High" perf="Growing" />
                <W x={tlX} y={botY} mat="Low" perf="Contracting" />
                <W x={trX} y={botY} mat="Low" perf="Growing" />
              </g>
            );
          })()}

        <g transform={T}>
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

        {/* Axis labels (fixed) */}
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
              ← contracting · PERFORMANCE (YoY, same period) · growing →
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
              MATERIALITY (size + height) →
            </text>
          </>
        )}

        <g transform={T}>
          <g
            style={{
              opacity: entered ? 1 : 0,
              transition: 'opacity 550ms ease',
            }}
          >
            {placed.map((node) => {
              const isHovered = hoveredId === node.id;
              const showLabel = node.isCluster || node.r >= LABEL_MIN_RADIUS;
              return (
                <g key={node.id} transform={`translate(${node.x},${node.y})`}>
                  {node.isCluster && (
                    <circle
                      r={node.r + 5}
                      fill="none"
                      stroke="rgba(31,41,55,0.45)"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      pointerEvents="none"
                    />
                  )}
                  {node.queuePending && !node.isCluster && (
                    <circle
                      r={node.r + 8}
                      fill="none"
                      stroke={HALO_STROKE}
                      strokeWidth={2.5}
                      className="vrs-halo"
                      pointerEvents="none"
                    />
                  )}
                  <circle
                    r={node.r}
                    fill={HEALTH_FILL[node.attention.level]}
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
                      y={node.isCluster ? -5 : 0}
                      pointerEvents="none"
                      fill="white"
                      style={{
                        fontSize: node.isCluster
                          ? Math.max(10, Math.min(node.r / 4, 15))
                          : Math.max(9, Math.min(node.r / 4.2, 13)),
                        fontWeight: 700,
                        userSelect: 'none',
                      }}
                    >
                      {node.isCluster
                        ? compactName(node.name).slice(0, 16)
                        : compactName(node.name)}
                    </text>
                  )}
                  {node.isCluster && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      y={10}
                      pointerEvents="none"
                      fill="white"
                      style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}
                    >
                      {node.count} ▾
                    </text>
                  )}
                  {isHovered && (
                    <g pointerEvents="none">
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        y={node.r + 16}
                        className="fill-gray-900"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          paintOrder: 'stroke',
                          stroke: 'white',
                          strokeWidth: 4,
                          strokeLinejoin: 'round',
                        }}
                      >
                        {node.name}
                      </text>
                      {node.attribution.slice(0, 3).map((line, i) => (
                        <text
                          key={i}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          y={node.r + 32 + i * 14}
                          className="fill-gray-600"
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            paintOrder: 'stroke',
                            stroke: 'white',
                            strokeWidth: 3.5,
                            strokeLinejoin: 'round',
                          }}
                        >
                          {line}
                        </text>
                      ))}
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Attention legend */}
      <div className="absolute top-3 right-3 bg-white/85 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
        <div className="font-medium text-gray-700 mb-1.5">Attention</div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Cliff /
            behind
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> YoY
            collapse / adj.
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

      {/* Zoom controls */}
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

      <style>{`
        @keyframes vrs-halo-pulse {
          0%,100% { opacity:.65; transform:scale(1); }
          50% { opacity:.2; transform:scale(1.18); }
        }
        .vrs-halo { animation: vrs-halo-pulse 1.8s ease-in-out infinite;
          transform-origin:center; transform-box:fill-box; }
      `}</style>
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
