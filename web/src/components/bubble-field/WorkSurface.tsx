'use client';

// WorkSurface — wraps BubbleField + the floating toolbar.
// Holds X / Y / size metric selection state. Selectors update the bubble layout live.

import { useState } from 'react';
import type { UserRole } from '@vrs/db';
import { BubbleField } from './BubbleField';
import { VendorRecordSlider } from '@/components/vendor-record/VendorRecordSlider';
import {
  METRIC_KEYS,
  METRIC_LABELS,
  METRIC_PENDING,
  type BubbleVendor,
  type MetricKey,
} from '@/lib/bubble-data';

export function WorkSurface({
  vendors,
  role,
}: {
  vendors: BubbleVendor[];
  role: UserRole;
}) {
  // Defaults (docs/21): real-signal, non-collinear, instantly populated on
  // real data. X = program breadth, Y = this-FY earnings, size = lifetime
  // materiality; colour carries attention. Not the old collinear "bigness".
  const [xMetric, setXMetric] = useState<MetricKey>('activePrograms');
  const [yMetric, setYMetric] = useState<MetricKey>('earningsFY');
  const [sizeMetric, setSizeMetric] = useState<MetricKey>('earningsLTD');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  return (
    <>
      <BubbleField
        vendors={vendors}
        xMetric={xMetric}
        yMetric={yMetric}
        sizeMetric={sizeMetric}
        onSelect={setSelectedVendorId}
      />

      <VendorRecordSlider
        vendorId={selectedVendorId}
        role={role}
        onClose={() => setSelectedVendorId(null)}
      />

      {/* Floating toolbar — bottom-anchored, pointer-events on so dropdowns work */}
      <div className="absolute bottom-4 left-4 right-4 z-20 px-3 py-2 bg-white/80 backdrop-blur-sm border border-gray-300 rounded-lg shadow-md flex items-center gap-3 flex-wrap">
        <MetricSelector label="X" value={xMetric} onChange={setXMetric} />
        <MetricSelector label="Y" value={yMetric} onChange={setYMetric} />
        <MetricSelector label="Size" value={sizeMetric} onChange={setSizeMetric} />
        <div className="ml-auto text-xs text-gray-500 hidden md:block">
          {vendors.length.toLocaleString()} vendors · deterministic · by rank ·
          median-centered
        </div>
      </div>
    </>
  );
}

function MetricSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MetricKey;
  onChange: (v: MetricKey) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs uppercase tracking-wider text-gray-500 font-medium w-8">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MetricKey)}
        className="px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
      >
        {METRIC_KEYS.map((k) => (
          <option key={k} value={k}>
            {METRIC_LABELS[k]}
          </option>
        ))}
        {/* Designed but not yet computable — shown disabled+labeled so the
            intent is visible without faking data (docs/21 §7). */}
        <optgroup label="Awaiting Ken extract">
          {METRIC_PENDING.map((p) => (
            <option key={p.label} disabled value="">
              {p.label} — awaiting {p.awaiting}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
