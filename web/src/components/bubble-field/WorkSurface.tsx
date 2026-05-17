'use client';

// WorkSurface — view settings (docs/21 §9.6) + the estate drill-down
// aggregation (docs/21 §8.2). The estate is NEVER raw atoms: it opens as
// analyst clusters; clicking a cluster drills (analyst → program-type →
// atoms). Atoms render only when the working set ≤ CEILING; above it the
// next dimension aggregates (decided 2026-05-17). No collision; deterministic.

import { useMemo, useState } from 'react';
import type { UserRole } from '@vrs/db';
import { Settings2, ChevronDown, ChevronRight } from 'lucide-react';
import { BubbleField, type FieldNode } from './BubbleField';
import { VendorRecordSlider } from '@/components/vendor-record/VendorRecordSlider';
import {
  type BubbleVendor,
  type ComponentKey,
  type CategoryKey,
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  CATEGORY_OF,
  CATEGORY_LABELS,
  CATEGORY_AVAILABLE,
  PENDING_COMPONENTS,
} from '@/lib/bubble-data';

const CATS: CategoryKey[] = ['cat1', 'cat2', 'cat3'];
const CEILING = 200; // max atoms before the next dimension aggregates

// Drill dimensions, in order (docs/21 §8.2; analyst default per David).
const DIMS = [
  {
    key: 'analyst',
    label: 'Analyst',
    of: (v: BubbleVendor) => v.analystId,
    name: (v: BubbleVendor) => v.analystName,
  },
  {
    key: 'programType',
    label: 'Program type',
    of: (v: BubbleVendor) => v.programTypeId,
    name: (v: BubbleVendor) => v.programTypeName,
  },
] as const;

function money(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}

export function WorkSurface({
  vendors,
  role,
  meta,
}: {
  vendors: BubbleVendor[];
  role: UserRole;
  meta: { curY: number; prevY: number; curMaxP: number; fullFY: number | null };
}) {
  const [weights, setWeights] = useState<Record<CategoryKey, number>>({
    cat1: 34,
    cat2: 33,
    cat3: 33,
  });
  const [override, setOverride] = useState<ComponentKey | ''>('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Drill path: one entry per drilled level ({dimIdx,key,label}).
  const [path, setPath] = useState<
    { dimIdx: number; key: string; label: string }[]
  >([]);

  const compsByCat = useMemo(() => {
    const m: Record<CategoryKey, ComponentKey[]> = {
      cat1: [],
      cat2: [],
      cat3: [],
    };
    for (const k of COMPONENT_KEYS) m[CATEGORY_OF[k]].push(k);
    return m;
  }, []);
  const availCats = useMemo(
    () => CATS.filter((c) => CATEGORY_AVAILABLE[c] && compsByCat[c].length > 0),
    [compsByCat],
  );

  // Per-vendor materiality (client composite — re-weights live, no refetch).
  const materialityOf = useMemo(() => {
    return (v: BubbleVendor): number => {
      if (override) return v.pctl[override];
      const sw = availCats.reduce((s, c) => s + weights[c], 0) || 1;
      return availCats.reduce((s, c) => {
        const comps = compsByCat[c];
        const sub = comps.reduce((a, k) => a + v.pctl[k], 0) / comps.length;
        return s + (weights[c] / sw) * sub;
      }, 0);
    };
  }, [override, weights, availCats, compsByCat]);

  // Apply the drill path, then decide atoms vs the next aggregate level.
  const { nodes, levelDesc } = useMemo(() => {
    let working = vendors;
    for (const p of path) {
      const dim = DIMS[p.dimIdx]!;
      working = working.filter((v) => (dim.of(v) ?? '∅') === p.key);
    }
    const level = path.length;
    const asAtoms = working.length <= CEILING || level >= DIMS.length;

    let built: FieldNode[];
    if (asAtoms) {
      built = working.map((v) => {
        const attribution: string[] = [];
        if (override) {
          attribution.push(
            `${COMPONENT_LABELS[override]}: ${Math.round(v.pctl[override] * 100)}th pctl`,
          );
        } else {
          const top = [...COMPONENT_KEYS]
            .sort((a, b) => v.pctl[b] - v.pctl[a])
            .slice(0, 2);
          attribution.push(
            'Materiality: ' +
              top
                .map(
                  (k) =>
                    `${COMPONENT_LABELS[k].replace('Earnings · ', '')} ${Math.round(v.pctl[k] * 100)}%`,
                )
                .join(' · '),
          );
        }
        attribution.push(
          `Performance: ${v.performance >= 0 ? '+' : ''}${Math.round(v.performance * 100)}% YoY (same period)`,
        );
        for (const r of v.attention.reasons) attribution.push(`⚠ ${r}`);
        return {
          id: v.id,
          name: v.name,
          vendorNumber: v.vendorNumber,
          materiality: materialityOf(v),
          performancePctl: v.performancePctl,
          performanceRaw: v.performance,
          attention: v.attention,
          queuePending: v.queuePending,
          attribution,
        };
      });
    } else {
      const dim = DIMS[level]!;
      const groups = new Map<string, BubbleVendor[]>();
      for (const v of working) {
        const k = dim.of(v) ?? '∅';
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(v);
      }
      const raw = [...groups.entries()].map(([key, members]) => {
        const mat = members.reduce((s, v) => s + materialityOf(v), 0);
        const yc = members.reduce((s, v) => s + v.ytdCur, 0);
        const yp = members.reduce((s, v) => s + v.ytdPrev, 0);
        const perf = yp !== 0 ? (yc - yp) / Math.abs(yp) : yc > 0 ? 1 : 0;
        let red = 0;
        let amber = 0;
        let stake = 0;
        for (const v of members) {
          if (v.attention.level === 'RED') red++;
          else if (v.attention.level === 'AMBER') amber++;
          stake += v.attention.stake;
        }
        const lvl = red > 0 ? 'RED' : amber > 0 ? 'AMBER' : 'GREEN';
        return {
          key,
          name: dim.name(members[0]!),
          members,
          mat,
          perf,
          red,
          amber,
          stake,
          level: lvl as 'RED' | 'AMBER' | 'GREEN',
        };
      });
      // Performance percentile among clusters (X position).
      const perfSorted = [...raw].sort((a, b) => a.perf - b.perf);
      const perfPctl = new Map<string, number>();
      perfSorted.forEach((g, i) =>
        perfPctl.set(g.key, (i + 0.5) / (raw.length || 1)),
      );
      built = raw.map((g) => ({
        id: `clu:${level}:${g.key}`,
        name: g.name,
        vendorNumber: 0,
        materiality: g.mat,
        performancePctl: perfPctl.get(g.key) ?? 0.5,
        performanceRaw: g.perf,
        attention: {
          level: g.level,
          reasons:
            g.red + g.amber > 0
              ? [`${g.red} cliff/behind · ${g.amber} collapse/adj.`]
              : [],
          stake: g.stake,
        },
        queuePending: false,
        isCluster: true,
        count: g.members.length,
        attribution: [
          `${g.members.length} vendors`,
          g.red + g.amber > 0
            ? `${g.red} cliff/behind · ${g.amber} collapse`
            : 'on track',
          g.stake > 0 ? `${money(g.stake)} at stake` : '',
          `Performance ${g.perf >= 0 ? '+' : ''}${Math.round(g.perf * 100)}% YoY`,
        ].filter(Boolean),
      }));
    }

    // Normalize materiality to 0..1 across the render set so bubble size
    // is consistent whether atoms or summed clusters (Y-rank unaffected).
    const maxMat = Math.max(...built.map((b) => b.materiality), 1e-9);
    for (const b of built) b.materiality = b.materiality / maxMat;

    const desc = asAtoms
      ? `${working.length.toLocaleString()} vendors`
      : `${built.length} ${DIMS[level]!.label.toLowerCase()} clusters — click to drill`;
    return { nodes: built, levelDesc: desc };
  }, [vendors, path, materialityOf, override]);

  function onSelectNode(id: string) {
    if (id.startsWith('clu:')) {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      const [, lvlStr, key] = id.split(/clu:(\d+):/);
      const dimIdx = Number(lvlStr);
      setPath((p) => [...p, { dimIdx, key: key ?? '∅', label: node.name }]);
      setSelectedVendorId(null);
    } else {
      setSelectedVendorId(id);
    }
  }

  const matSummary = override
    ? COMPONENT_LABELS[override]
    : `Composite (${availCats
        .map((c) => `${CATEGORY_LABELS[c][0]} ${weights[c]}`)
        .join(' · ')})`;

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="m-3 flex items-center gap-3 rounded-lg border border-gray-300 bg-white/85 px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm">
          {/* Breadcrumb (drill path) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPath([])}
              className="font-semibold uppercase tracking-wider text-gray-500 hover:text-blue-600"
            >
              Estate
            </button>
            {path.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-gray-400" />
                <button
                  type="button"
                  onClick={() => setPath((pp) => pp.slice(0, i + 1))}
                  className="max-w-[160px] truncate text-gray-700 hover:text-blue-600"
                  title={p.label}
                >
                  {p.label}
                </button>
              </span>
            ))}
            <span className="ml-2 text-gray-400">· {levelDesc}</span>
          </div>

          <span className="ml-auto text-gray-600">
            Materiality: <strong>{matSummary}</strong>
            <span className="mx-2 text-gray-300">·</span>
            Perf: <strong>YoY</strong>{' '}
            <span className="text-gray-400">
              (FY{meta.curY} P1–{meta.curMaxP} vs FY{meta.prevY})
            </span>
            <span className="mx-2 text-gray-300">·</span>
            Colour: <strong>Attention</strong>
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen((s) => !s)}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-100"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Adjust
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {settingsOpen && (
          <div className="mx-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs shadow-lg">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <div className="mb-1.5 font-semibold uppercase tracking-wider text-gray-500">
                  Materiality composite — weights
                </div>
                {CATS.map((c) => {
                  const avail = CATEGORY_AVAILABLE[c];
                  return (
                    <label
                      key={c}
                      className={`mb-1.5 flex items-center gap-2 ${avail ? '' : 'opacity-50'}`}
                    >
                      <span className="w-28 text-gray-700">
                        {CATEGORY_LABELS[c]}
                        {!avail && (
                          <span className="text-gray-400"> · awaiting D1/D2</span>
                        )}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={weights[c]}
                        disabled={!avail || !!override}
                        onChange={(e) =>
                          setWeights((w) => ({
                            ...w,
                            [c]: Number(e.target.value),
                          }))
                        }
                        className="flex-1 accent-blue-600"
                      />
                      <span className="w-7 text-right tabular-nums text-gray-500">
                        {weights[c]}
                      </span>
                    </label>
                  );
                })}
                <p className="mt-1 text-[11px] text-gray-400">
                  Unavailable categories renormalize — never faked. Equal-thirds
                  default.
                </p>
              </div>
              <div>
                <div className="mb-1.5 font-semibold uppercase tracking-wider text-gray-500">
                  Or single variable
                </div>
                <select
                  value={override}
                  onChange={(e) =>
                    setOverride(e.target.value as ComponentKey | '')
                  }
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5"
                >
                  <option value="">Composite (default)</option>
                  {COMPONENT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {COMPONENT_LABELS[k]}
                    </option>
                  ))}
                  <optgroup label="Awaiting Ken extract">
                    {PENDING_COMPONENTS.map((p) => (
                      <option key={p.label} disabled value="">
                        {p.label} — awaiting {p.awaiting}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <div className="mt-3 font-semibold uppercase tracking-wider text-gray-500">
                  Performance · Window · Seat
                </div>
                <p className="mt-1 text-gray-500">
                  YoY same-period · Trailing 12 mo · seat ={' '}
                  <strong>{role}</strong> (more as data lands)
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <BubbleField nodes={nodes} onSelect={onSelectNode} />

      <VendorRecordSlider
        vendorId={selectedVendorId}
        role={role}
        onClose={() => setSelectedVendorId(null)}
      />

      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md bg-white/70 px-2 py-1 text-[11px] text-gray-500 backdrop-blur-sm">
        {vendors.length.toLocaleString()} vendors · deterministic · drill, don't
        crowd
      </div>
    </>
  );
}
