'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';
import type { FilterOptions } from '../lib/api';
import {
  filtersFromUrl,
  filtersToQuery,
  withFilter,
  type FilterName,
} from '../lib/filters';

/** Text input with suggestions; commits only a listed value or an empty one. */
function Combo(props: {
  label: string;
  value: string;
  options: string[];
  onCommit: (value: string | null) => void;
}) {
  const listId = useId();
  return (
    <label className="field">
      <span>{props.label}</span>
      {/* key: a reset or back navigation remounts the input with the URL value */}
      <input
        key={props.value}
        list={listId}
        defaultValue={props.value}
        placeholder="All"
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === '') props.onCommit(null);
          else if (props.options.includes(v)) props.onCommit(v);
        }}
      />
      <datalist id={listId}>
        {props.options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

function Select(props: {
  label: string;
  value: string;
  options: string[];
  onCommit: (value: string | null) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onCommit(e.target.value || null)}
      >
        <option value="">All</option>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = filtersFromUrl(params);

  function set(name: FilterName, value: string | null) {
    const q = withFilter(params, name, value);
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  // Dates default to the full data period. The default is not written to the
  // URL, so "no from/to" always means the whole period.
  const min = options.period?.from;
  const max = options.period?.to;

  return (
    <form
      className="filter-bar"
      aria-label="Filters"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="field">
        <span>From</span>
        <input
          type="date"
          min={min}
          max={filters.to ?? max}
          value={filters.from ?? min ?? ''}
          onChange={(e) =>
            set('from', e.target.value !== min ? e.target.value : null)
          }
        />
      </label>
      <label className="field">
        <span>To</span>
        <input
          type="date"
          min={filters.from ?? min}
          max={max}
          value={filters.to ?? max ?? ''}
          onChange={(e) =>
            set('to', e.target.value !== max ? e.target.value : null)
          }
        />
      </label>
      <Select
        label="ABC class"
        value={filters.abcClass ?? ''}
        options={options.abcClasses}
        onCommit={(v) => set('abcClass', v)}
      />
      <Combo
        label="Reference"
        value={filters.reference ?? ''}
        options={options.references}
        onCommit={(v) => set('reference', v)}
      />
      <Combo
        label="Customer"
        value={filters.customer ?? ''}
        options={options.customers}
        onCommit={(v) => set('customer', v)}
      />
      <Select
        label="Operator"
        value={filters.operator ?? ''}
        options={options.operators}
        onCommit={(v) => set('operator', v)}
      />
      <Select
        label="Aisle"
        value={filters.aisle ?? ''}
        options={options.aisles}
        onCommit={(v) => set('aisle', v)}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={filters.excludeDuplicates === 'true'}
          onChange={(e) =>
            set('excludeDuplicates', e.target.checked ? 'true' : null)
          }
        />
        Exclude exact duplicate lines
      </label>
      <button
        type="button"
        disabled={filtersToQuery(filters) === ''}
        onClick={() => router.replace(pathname, { scroll: false })}
      >
        Reset
      </button>
    </form>
  );
}
