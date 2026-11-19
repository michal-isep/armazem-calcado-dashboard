'use client';

import { useSearchParams } from 'next/navigation';
import type { FilterReport } from '../lib/api';
import {
  FILTER_LABEL,
  FILTER_NAMES,
  SOURCE_LABEL,
  filtersFromUrl,
  notAppliedReason,
  type Source,
} from '../lib/filters';

/**
 * Shows, on a card, which of the active filters change it and which do not.
 * A filter that does not apply is greyed out with its reason, never ignored
 * silently (spec section 5). Pass the API's `filters` report when the card
 * has one; otherwise the same rules are applied from the card's source file.
 */
export function CardFilters({
  source,
  report,
}: {
  source: Source;
  report?: FilterReport;
}) {
  const filters = filtersFromUrl(useSearchParams());
  const rows = FILTER_NAMES.filter((n) => filters[n] !== undefined).map(
    (name) => {
      let reason: string | null;
      if (!report) reason = notAppliedReason(name, source);
      else if (name === 'excludeDuplicates') {
        reason = report.excludeDuplicates.applied
          ? null
          : (notAppliedReason(name, source) ?? 'Not applied to this card');
      } else {
        reason = report.notApplied.find((x) => x.filter === name)?.reason ?? null;
      }
      const value =
        name === 'excludeDuplicates' ? 'on' : (filters[name] as string);
      return { name, value, reason };
    },
  );

  return (
    <div className="card-filters">
      <span className="source">Source: {SOURCE_LABEL[source]}</span>
      {rows.length === 0 ? (
        <span>No filters active</span>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.name} className={r.reason ? 'greyed' : undefined}>
              {FILTER_LABEL[r.name]}: {r.value}
              {r.reason && <small> (not applied: {r.reason})</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
