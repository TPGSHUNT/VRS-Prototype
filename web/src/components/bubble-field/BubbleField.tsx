'use client';

// Vendor bubble field — D3 force simulation with positional forces toward
// quadrant targets driven by the selected X / Y / size metrics.
// Phase 2a: rendering only. No clicks, no slider, no filters yet.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCollide,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import {
  METRIC_FORMAT,
  METRIC_LABELS,
  type BubbleVendor,
  type MetricKey,
} from '@/lib/bubble-data';

interface BubbleNode extends BubbleVendor {
  radius: number;
  targetX: number;
  targetY: number;
  // d3-force injects:
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
}

const HEALTH_FILL: Record<BubbleHealthShort, string> = {
  GREEN: 'rgb(34, 197, 94)',
  AMBER: 'rgb(245, 158, 11)',
  RED: 'rgb(239, 68, 68)',
};
type BubbleHealthShort = BubbleVendor['health'];

const HALO_STROKE = 'rgb(59, 130, 246)';

const MIN_RADIUS = 22;
const MAX_RADIUS = 60;
// Padding reserves space for axis labels (left/bottom), the floating toolbar
// (bottom — ~60px), and the health legend (top-right — ~150x90px).
const PADDING = { left: 70, right: 170, top: 110, bottom: 110 };

interface BubbleFieldProps {
  vendors: BubbleVendor[];
  xMetric: MetricKey;
  yMetric: MetricKey;
  sizeMetric: MetricKey;
  onSelect?: (vendorId: string) => void;
}

export function BubbleField({ vendors, xMetric, yMetric, sizeMetric, onSelect }: BubbleFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [nodes, setNodes] = useState<BubbleNode[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    id: string;
    name: string;
    queuePending: boolean;
  } | null>(null);
  const simRef = useRef<Simulation<BubbleNode, undefined> | null>(null);

  // Close the context menu on Escape.
  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);

  // Staged entrance: watermarks read bright on first paint, then bubbles fade
  // in over them while the watermarks dim to their resting opacity. Triggers
  // once on mount — axis changes don't re-run it.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 550);
    return () => clearTimeout(t);
  }, []);

  // Track container size
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

  // Position by rank/percentile (0..1) so the median lands at the chart's
  // visual center regardless of how skewed the underlying values are. This
  // also keeps bubbles spread across the whole viewport instead of bunched
  // along the diagonal when X and Y metrics correlate.
  // Size uses sqrt(value / max) so bubble *area* is proportional to vendor value.
  const { xCenter, yCenter, posX, posY, sizeFor } = useMemo(() => {
    if (!size.width || !size.height || vendors.length === 0) {
      return {
        xCenter: 0,
        yCenter: 0,
        posX: () => 0,
        posY: () => 0,
        sizeFor: () => MIN_RADIUS,
      };
    }

    const innerWidth = size.width - PADDING.left - PADDING.right;
    const innerHeight = size.height - PADDING.top - PADDING.bottom;
    const xCenter = PADDING.left + innerWidth / 2;
    const yCenter = PADDING.top + innerHeight / 2;

    const buildRanks = (key: MetricKey) => {
      const sorted = [...vendors].sort((a, b) => a.metrics[key] - b.metrics[key]);
      const ranks = new Map<string, number>();
      sorted.forEach((v, i) => {
        ranks.set(v.id, (i + 0.5) / sorted.length);
      });
      return ranks;
    };

    const xRanks = buildRanks(xMetric);
    const yRanks = buildRanks(yMetric);

    const posX = (v: BubbleVendor) =>
      PADDING.left + (xRanks.get(v.id) ?? 0.5) * innerWidth;
    // Y-axis is inverted: rank 1 (largest) at top.
    const posY = (v: BubbleVendor) =>
      PADDING.top + (1 - (yRanks.get(v.id) ?? 0.5)) * innerHeight;

    const sizeMax = Math.max(
      ...vendors.map((v) => Math.max(v.metrics[sizeMetric], 0)),
      1,
    );
    const sizeFor = (v: BubbleVendor) => {
      const val = Math.max(v.metrics[sizeMetric], 0);
      const t = Math.sqrt(val / sizeMax);
      return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
    };

    return { xCenter, yCenter, posX, posY, sizeFor };
  }, [vendors, xMetric, yMetric, sizeMetric, size.width, size.height]);

  // Build / rebuild simulation when vendors, size, or metrics change
  useEffect(() => {
    if (!size.width || !size.height || vendors.length === 0) return;

    const initial: BubbleNode[] = vendors.map((v) => ({
      ...v,
      radius: sizeFor(v),
      targetX: posX(v),
      targetY: posY(v),
      x: posX(v) + (Math.random() - 0.5) * 10,
      y: posY(v) + (Math.random() - 0.5) * 10,
    }));

    const sim = forceSimulation<BubbleNode>(initial)
      .force(
        'x',
        forceX<BubbleNode>((d) => d.targetX).strength(0.45),
      )
      .force(
        'y',
        forceY<BubbleNode>((d) => d.targetY).strength(0.45),
      )
      .force(
        'collide',
        forceCollide<BubbleNode>().radius((d) => d.radius + 4).strength(0.85),
      )
      .alphaDecay(0.025)
      .velocityDecay(0.45);

    const minX = PADDING.left;
    const maxX = size.width - PADDING.right;
    const minY = PADDING.top;
    const maxY = size.height - PADDING.bottom;

    sim.on('tick', () => {
      for (const n of sim.nodes()) {
        if (n.x !== undefined) n.x = Math.max(minX + n.radius, Math.min(maxX - n.radius, n.x));
        if (n.y !== undefined) n.y = Math.max(minY + n.radius, Math.min(maxY - n.radius, n.y));
      }
      setNodes(sim.nodes().slice());
    });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [vendors, size.width, size.height, xMetric, yMetric, sizeMetric, posX, posY, sizeFor]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
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

        {/* Quadrant watermarks — large faded labels behind bubbles. */}
        {size.width > 0 && (() => {
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
              <text textAnchor="middle" className="fill-gray-300" style={titleStyle}>
                {yWord} {yLabel}
              </text>
              <text textAnchor="middle" y={18} className="fill-gray-300" style={subStyle}>
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

        {/* Quadrant cross-hairs at chart center (median lands at center under rank scaling) */}
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

        {/* Axis labels */}
        {size.width > 0 && (
          <>
            <text
              x={size.width / 2}
              y={size.height - 18}
              textAnchor="middle"
              className="fill-gray-600"
              style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}
            >
              X · {METRIC_LABELS[xMetric]} {METRIC_FORMAT[xMetric] === 'money' ? '($ · by rank)' : '(count · by rank)'} →
            </text>
            <text
              transform={`translate(20, ${size.height / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-gray-600"
              style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}
            >
              Y · {METRIC_LABELS[yMetric]} {METRIC_FORMAT[yMetric] === 'money' ? '($ · by rank)' : '(count · by rank)'} →
            </text>
          </>
        )}

        {/* Bubbles — wrapped in a group that fades + scales in once `entered`
            flips, so the user reads the empty quadrant frame first. */}
        <g
          style={{
            opacity: entered ? 1 : 0,
            transform: entered ? 'scale(1)' : 'scale(0.94)',
            transformOrigin: 'center',
            transformBox: 'fill-box',
            transition: 'opacity 650ms ease, transform 650ms ease',
          }}
        >
        {nodes.map((node) => {
          const isHovered = hoveredId === node.id;
          const fill = HEALTH_FILL[node.health];
          const cx = node.x ?? 0;
          const cy = node.y ?? 0;
          return (
            <g key={node.id} transform={`translate(${cx},${cy})`}>
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
                fill={fill}
                opacity={isHovered ? 1 : 0.85}
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
                  filter: isHovered ? 'drop-shadow(0 6px 16px rgba(0,0,0,0.3))' : 'none',
                  transform: isHovered ? 'scale(1.12)' : 'scale(1)',
                  transformOrigin: 'center',
                  transformBox: 'fill-box',
                  transition: 'transform 200ms ease, filter 200ms ease, opacity 200ms ease',
                  cursor: 'pointer',
                }}
              />
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

      </svg>

      {/* Health legend */}
      <div className="absolute top-3 right-3 bg-white/85 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
        <div className="font-medium text-gray-700 mb-1.5">Health</div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Green
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Amber
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Red
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-gray-600">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-500 inline-block" />
          Pending AP approval
        </div>
      </div>

      {/* Right-click context menu (P1.2). Open is live; the rest are honest
          "later" entries — disabled until their phase lands. */}
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
    .replace(/\b(LLC|INC|CORP|CO|EDI|CORPORATE|COMPANY|US|USA|NORTH AMERICA|GLOBAL)\b/g, '')
    .replace(/[\.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0) return raw.slice(0, 12);
  if (words.length === 1) return words[0]!.slice(0, 14);
  return (words[0] + ' ' + (words[1] ?? '')).slice(0, 14);
}
