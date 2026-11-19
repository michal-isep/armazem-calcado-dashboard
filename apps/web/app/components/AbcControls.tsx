'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  BASIS_LABEL,
  DEFAULT_THRESHOLDS,
  validThresholds,
  type Basis,
} from '../lib/abc';

/**
 * Basis switch and adjustable thresholds. Everything is written to the URL,
 * next to the global filters. The drill-down position is cleared on a change,
 * because the classes (and so the references in them) may change.
 */
export function AbcControls(props: {
  basis: Basis;
  thresholdA: number;
  thresholdB: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [a, setA] = useState(String(props.thresholdA));
  const [b, setB] = useState(String(props.thresholdB));
  const [error, setError] = useState<string | null>(null);

  function go(change: (q: URLSearchParams) => void) {
    const q = new URLSearchParams(params);
    q.delete('drillClass');
    q.delete('drillRef');
    change(q);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const na = Number(a);
    const nb = Number(b);
    if (a.trim() === '' || b.trim() === '' || !validThresholds(na, nb)) {
      setError('Thresholds must satisfy 0 < A < B <= 100.');
      return;
    }
    setError(null);
    go((q) => {
      if (na === DEFAULT_THRESHOLDS.a && nb === DEFAULT_THRESHOLDS.b) {
        q.delete('thresholdA');
        q.delete('thresholdB');
      } else {
        q.set('thresholdA', String(na));
        q.set('thresholdB', String(nb));
      }
    });
  }

  function reset() {
    setA(String(DEFAULT_THRESHOLDS.a));
    setB(String(DEFAULT_THRESHOLDS.b));
    setError(null);
    go((q) => {
      q.delete('thresholdA');
      q.delete('thresholdB');
    });
  }

  const isDefault =
    props.thresholdA === DEFAULT_THRESHOLDS.a &&
    props.thresholdB === DEFAULT_THRESHOLDS.b;

  return (
    <form className="abc-controls" onSubmit={apply}>
      <fieldset>
        <legend>ABC basis</legend>
        {(['lines', 'units'] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="basis"
              checked={props.basis === value}
              onChange={() =>
                go((q) => {
                  if (value === 'lines') q.delete('basis');
                  else q.set('basis', value);
                })
              }
            />{' '}
            {BASIS_LABEL[value]}
            {value === 'lines' && ' (default)'}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Thresholds (cumulative %)</legend>
        <label>
          A below{' '}
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
        </label>
        <label>
          B below{' '}
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            value={b}
            onChange={(e) => setB(e.target.value)}
          />
        </label>
        <button type="submit">Apply</button>
        <button type="button" onClick={reset} disabled={isDefault && !error}>
          Reset to 80/95
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
