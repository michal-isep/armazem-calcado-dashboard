import type { Abc } from '../lib/api';
import { BASIS_LABEL } from '../lib/abc';
import { formatInt } from '../lib/format';

const W = 720;
const H = 310;
const PAD = { left: 58, right: 58, top: 26, bottom: 44 };

export const CLASS_COLOUR = {
  A: '#2e86c1',
  B: '#b9770e',
  C: '#7f8c8d',
} as const;

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

  // Where each class starts and ends along the rank axis, from the rows
  // themselves (the API assigns the classes; nothing is recomputed here).
  const bands = (['A', 'B', 'C'] as const)
    .map((c) => {
      const idx = rows.flatMap((r, i) => (r.abcClass === c ? [i] : []));
      if (idx.length === 0) return null;
      const last = rows[idx[idx.length - 1]];
      return {
        c,
        count: idx.length,
        x1: PAD.left + step * idx[0],
        x2: PAD.left + step * (idx[idx.length - 1] + 1),
        cumulative: Math.min(
          100,
          last.cumulativeBeforePercent + last.sharePercent,
        ),
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

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
        {bands.map((b) => (
          <g key={b.c}>
            <rect
              x={b.x1}
              y={PAD.top}
              width={b.x2 - b.x1}
              height={plotH}
              fill={CLASS_COLOUR[b.c]}
              opacity={0.1}
            />
            {b.c !== 'A' && (
              <line
                className="divider"
                x1={b.x1}
                x2={b.x1}
                y1={PAD.top}
                y2={PAD.top + plotH}
              />
            )}
            <text
              className="band-label"
              x={(b.x1 + b.x2) / 2}
              y={PAD.top - 8}
              textAnchor="middle"
              fill={CLASS_COLOUR[b.c]}
            >
              {`${b.c}: ${formatInt(b.count)} products, to ${b.cumulative.toFixed(0)}%`}
            </text>
          </g>
        ))}
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
        <text className="tick" x={PAD.left} y={PAD.top + plotH + 14}>
          rank 1
        </text>
        <text
          className="tick"
          x={W - PAD.right}
          y={PAD.top + plotH + 14}
          textAnchor="end"
        >
          rank {formatInt(rows[rows.length - 1].rank)}
        </text>
        <text className="axis-title" x={W / 2} y={H - 6} textAnchor="middle">
          Products, from most to least ordered
        </text>
        <text
          className="axis-title"
          transform={`translate(13 ${PAD.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          Share of {basisLabel} per product
        </text>
        <text
          className="axis-title"
          transform={`translate(${W - 13} ${PAD.top + plotH / 2}) rotate(90)`}
          textAnchor="middle"
        >
          Cumulative share of all {basisLabel}
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
      <p className="note">
        How to read: each bar is one product, the most ordered on the left. The
        line adds the bars up; where it crosses a dashed line the class changes.
        Hover a bar for its numbers.
      </p>
    </figure>
  );
}
