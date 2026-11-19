'use client';

import { useState } from 'react';
import type { MonthIndicators } from '../lib/api';
import { formatInt, formatMonth } from '../lib/format';

type Ratio =
  | 'm2AverageOrderSize'
  | 'm3AverageOrdersPerWave'
  | 'x1LinesPerOrder'
  | 'x2SplitOrdersPercent';

const W = 300;
const H = 120;
const PAD = { left: 36, right: 10, top: 10, bottom: 22 };

/**
 * One ratio indicator per month. Partial months are drawn hollow and
 * labelled "(partial)"; a month without orders leaves a gap, never a zero.
 * Hover or focus a point for the month's counts and days covered.
 */
export function TrendChart(props: {
  title: string;
  field: Ratio;
  unit?: '%';
  months: MonthIndicators[];
}) {
  const { title, field, unit, months } = props;
  const [active, setActive] = useState<number | null>(null);

  const values = months.map((m) => m[field]);
  const known = values.filter((v): v is number => v !== null);
  const min = known.length ? Math.min(...known) : 0;
  const max = known.length ? Math.max(...known) : 1;
  const pad = (max - min) * 0.15 || 1;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;

  const x = (i: number) =>
    PAD.left +
    (months.length === 1
      ? (W - PAD.left - PAD.right) / 2
      : (i * (W - PAD.left - PAD.right)) / (months.length - 1));
  const y = (v: number) =>
    PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  // Line segments only between consecutive months that both have a value.
  const segments: string[] = [];
  months.forEach((_, i) => {
    const a = values[i];
    const b = values[i + 1];
    if (a !== null && b !== null && b !== undefined) {
      segments.push(`M${x(i)},${y(a)}L${x(i + 1)},${y(b)}`);
    }
  });

  const show = (v: number) => `${v.toFixed(2)}${unit ?? ''}`;
  const m = active === null ? null : months[active];

  return (
    <figure className="trend">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line
          x1={PAD.left}
          x2={PAD.left}
          y1={PAD.top}
          y2={H - PAD.bottom}
          className="axis"
        />
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          className="axis"
        />
        <text x={PAD.left - 4} y={y(hi) + 8} textAnchor="end" className="tick">
          {hi.toFixed(1)}
        </text>
        <text x={PAD.left - 4} y={y(lo)} textAnchor="end" className="tick">
          {lo.toFixed(1)}
        </text>
        {segments.map((d) => (
          <path key={d} d={d} className="trend-line" />
        ))}
        {months.map((month, i) => {
          const v = values[i];
          return (
            <g key={month.month}>
              <text x={x(i)} y={H - 6} textAnchor="middle" className="tick">
                {formatMonth(month.month).slice(0, 3)}
                {month.partial ? '*' : ''}
              </text>
              {v !== null && (
                <circle
                  cx={x(i)}
                  cy={y(v)}
                  r={active === i ? 5 : 4}
                  className={month.partial ? 'point partial' : 'point'}
                  tabIndex={0}
                  role="img"
                  aria-label={`${formatMonth(month.month)}: ${show(v)}${month.partial ? ', partial month' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="tooltip" aria-live="polite">
        {m ? (
          <>
            <strong>
              {formatMonth(m.month)}
              {m.partial && ' (partial)'}
            </strong>
            : {m[field] === null ? 'no data' : show(m[field])}
            <br />
            {formatInt(m.orders)} orders, {formatInt(m.units)} units,{' '}
            {m.daysCovered} of {m.daysInMonth} days covered
          </>
        ) : (
          'Hover or focus a point for orders, units and days covered'
        )}
      </div>
    </figure>
  );
}
