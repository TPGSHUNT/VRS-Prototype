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
const PADDING = { left: 70, right: 30, top: 30, bottom: 70 };

interface BubbleFieldProps {
  vendors: BubbleVendor[];
  xMetric: MetricKey;
  yMetric: MetricKey;
  sizeMetric: MetricKey;
}

export function BubbleField({ vendors, xMetric, yMetric, sizeMetric }: BubbleFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [nodes, setNodes] = useState<BubbleNode[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const simRef = useRef<Simulation<BubbleNode, undefined> | null>(null);

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

  // Compute log-scaled axis ranges + median cross-hair positions
  const { xMedian, yMedian, scaleX, scaleY, scaleR } = useMemo(() => {
    if (!size.width || !size.height || vendors.length === 0) {
      return { xMedian: 0, yMedian: 0, scaleX: () => 0, scaleY: () => 0, scaleR: () => MIN_RADIUS };
    }

    const innerWidth = size.width - PADDING.left - PADDING.right;
    const innerHeight = size.height - PADDING.top - PADDING.bottom;

    // Helpers to compute log domain (clamping zeros to 1 so log is defined)
    const buildLogScale = (key: MetricKey) => {
      const vals = vendors.map((v) => Math.max(Math.abs(v.metrics[key]), 1));
      const logMin = Math.log10(Math.min(...vals));
      const logMax = Math.log10(Math.max(...vals));
      const range = Math.max(logMax - logMin, 0.001);
      return { logMin, logMax, range, sortedVals: [...vals].sort((a, b) => a - b) };
    };

    const x = buildLogScale(xMetric);
    const y = buildLogScale(yMetric);
    const r = buildLogScale(sizeMetric);

    const scaleX = (val: number) => {
      const v = Math.log10(Math.max(Math.abs(val), 1));
      const t = (v - x.logMin) / x.range;
      return PADDING.left + t * innerWidth;
    };
    const scaleY = (val: number) => {
      const v = Math.log10(Math.max(Math.abs(val), 1));
      const t = (v - y.logMin) / y.range;
      // Inverted — top is bigger
      return PADDING.top + (1 - t) * innerHeight;
    };
    const scaleR = (val: number) => {
      const v = Math.log10(Math.max(Math.abs(val), 1));
      const t = (v - r.logMin) / r.range;
      return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
    };

    // Median values (50th percentile)
    const median = (arr: number[]) => arr[Math.floor(arr.length / 2)] ?? 0;
    const xMedian = scaleX(median(x.sortedVals));
    const yMedian = scaleY(median(y.sortedVals));

    return { xMedian, yMedian, scaleX, scaleY, scaleR };
  }, [vendors, xMetric, yMetric, sizeMetric, size.width, size.height]);

  // Build / rebuild simulation when vendors, size, or metrics change
  useEffect(() => {
    if (!size.width || !size.height || vendors.length === 0) return;

    const initial: BubbleNode[] = vendors.map((v) => ({
      ...v,
      radius: scaleR(v.metrics[sizeMetric]),
      targetX: scaleX(v.metrics[xMetric]),
      targetY: scaleY(v.metrics[yMetric]),
      x: scaleX(v.metrics[xMetric]) + (Math.random() - 0.5) * 10,
      y: scaleY(v.metrics[yMetric]) + (Math.random() - 0.5) * 10,
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

    sim.on('tick', () => {
      setNodes(sim.nodes().slice());
    });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [vendors, size.width, size.height, xMetric, yMetric, sizeMetric, scaleX, scaleY, scaleR]);

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

        {/* Quadrant cross-hairs at median */}
        {size.width > 0 && (
          <>
            <line
              x1={xMedian}
              y1={PADDING.top}
              x2={xMedian}
              y2={size.height - PADDING.bottom}
              stroke="rgb(229, 231, 235)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <line
              x1={PADDING.left}
              y1={yMedian}
              x2={size.width - PADDING.right}
              y2={yMedian}
              stroke="rgb(229, 231, 235)"
              strokeWidth={1}
              strokeDasharray="4 4"
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
              X · {METRIC_LABELS[xMetric]} {METRIC_FORMAT[xMetric] === 'money' ? '($, log)' : '(count, log)'} →
            </text>
            <text
              transform={`translate(20, ${size.height / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-gray-600"
              style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}
            >
              Y · {METRIC_LABELS[yMetric]} {METRIC_FORMAT[yMetric] === 'money' ? '($, log)' : '(count, log)'} →
            </text>
          </>
        )}

        {/* Bubbles */}
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
    </div>
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
