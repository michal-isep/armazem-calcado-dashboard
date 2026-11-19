import type { Abc } from '../lib/api';
import { BASIS_LABEL } from '../lib/abc';
import { formatInt } from '../lib/format';

const W = 720;
const H = 260;
const PAD = { left: 44, right: 44, top: 12, bottom: 28 };

export const CLASS_COLOUR = { A: '#2e86c1', B: '#b9770e', C: '#7f8c8d' } as const;

/**
 * Pareto chart: one bar per reference in rank order (its share of the active
 * basis, left axis) and the cumulative share as a line (right axis), with the
 * A and B thresholds drawn as dashed lines. Server-rendered SVG; hover a bar
 * for its numbers. Colour is never the only cue: the classes are also named in
 * the legend and in the tables below.
 */
export function ParetoChart({ abc }: { abc: Abc }) {
  const rows = abc.references;
  if (rows.length === 0) return <p>No references to draw.</p>;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const maxShare = Math.max(...rows.map((r) => r.sharePercent));
  const step = plotW / rows.length;
  const barW = Math.max(step * 0.8, 0.5);
  const yBar = (v: number) => PAD.top + plotH - (v / maxShare) * plotH;
  const yCum = (v: number) => PAD.top + plotH - (v / 100) * plotH;
  const cx = (i: number) => PAD.left + step * (i + 0.5);

  const cumulative = rows.map((r, i) => {
    const after = Math.min(100, r.cumulativeBeforePercent + r.sharePercent);
    return `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${yCum(after).toFixed(1)}`;
  });
  const basisLabel = BASIS_LABEL[abc.basis];

  return (
    <figure className="pareto">
      <figcaption>
        Pareto of {formatInt(rows.length)} references by {basisLabel}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Pareto chart of references ranked by ${basisLabel}`}
      >
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line
              className="grid"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yCum(t)}
              y2={yCum(t)}
            />
            <text className="tick" x={W - PAD.right + 4} y={yCum(t) + 3}>
              {t}%
            </text>
          </g>
        ))}
        {[0, maxShare / 2, maxShare].map((t) => (
          <text
            key={t}
            className="tick"
            x={PAD.left - 4}
            y={yBar(t) + 3}
            textAnchor="end"
          >
            {t.toFixed(1)}%
          </text>
        ))}

        {rows.map((r, i) => (
          <rect
            key={r.reference}
            x={cx(i) - barW / 2}
            y={yBar(r.sharePercent)}
            width={barW}
            height={PAD.top + plotH - yBar(r.sharePercent)}
            fill={CLASS_COLOUR[r.abcClass]}
          >
            <title>
              {`#${r.rank} ${r.reference}, class ${r.abcClass}: ` +
                `${formatInt(r.lines)} lines, ${formatInt(r.units)} units, ` +
                `${r.sharePercent.toFixed(2)}% of ${basisLabel}, ` +
                `cumulative before ${r.cumulativeBeforePercent.toFixed(1)}%`}
            </title>
          </rect>
        ))}

        <path className="cum" d={cumulative.join('')} />
        {[
          { v: abc.thresholds.a, label: `A ${abc.thresholds.a}%` },
          { v: abc.thresholds.b, label: `B ${abc.thresholds.b}%` },
        ].map((t) => (
          <g key={t.label}>
            <line
              className="threshold"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yCum(t.v)}
              y2={yCum(t.v)}
            />
            <text className="tick" x={PAD.left + 4} y={yCum(t.v) - 3}>
              {t.label}
            </text>
          </g>
        ))}
        <text className="tick" x={PAD.left} y={H - 8}>
          rank 1
        </text>
        <text className="tick" x={W - PAD.right} y={H - 8} textAnchor="end">
          rank {formatInt(rows[rows.length - 1].rank)}
        </text>
      </svg>
      <p className="legend">
        {(['A', 'B', 'C'] as const).map((c) => (
          <span key={c}>
            <i style={{ background: CLASS_COLOUR[c] }} /> Class {c}
          </span>
        ))}
        <span>
          <i className="line" /> Cumulative share (right axis)
        </span>
      </p>
    </figure>
  );
}
