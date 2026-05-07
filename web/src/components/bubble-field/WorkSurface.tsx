'use client';

// WorkSurface — wraps BubbleField + the floating toolbar.
// Holds X / Y / size metric selection state. Selectors update the bubble layout live.

import { useState } from 'react';
import { BubbleField } from './BubbleField';
import { METRIC_KEYS, METRIC_LABELS, type BubbleVendor, type MetricKey } from '@/lib/bubble-data';

export function WorkSurface({ vendors }: { vendors: BubbleVendor[] }) {
  const [xMetric, setXMetric] = useState<MetricKey>('contractValue');
  const [yMetric, setYMetric] = useState<MetricKey>('annualEarnings');
  const [sizeMetric, setSizeMetric] = useState<MetricKey>('grossVolume');

  return (
    <>
      <BubbleField
        vendors={vendors}
        xMetric={xMetric}
        yMetric={yMetric}
        sizeMetric={sizeMetric}
      />

      {/* Floating toolbar — bottom-anchored, pointer-events on so dropdowns work */}
      <div className="absolute bottom-4 left-4 right-4 z-20 px-3 py-2 bg-white/80 backdrop-blur-sm border border-gray-300 rounded-lg shadow-md flex items-center gap-3 flex-wrap">
        <MetricSelector label="X" value={xMetric} onChange={setXMetric} />
        <MetricSelector label="Y" value={yMetric} onChange={setYMetric} />
        <MetricSelector label="Size" value={sizeMetric} onChange={setSizeMetric} />
        <div className="ml-auto text-xs text-gray-500 hidden md:block">
          {vendors.length} vendors · log scale · cross-hairs at median
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
      </select>
    </label>
  );
}
