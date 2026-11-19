import { connection } from 'next/server';
import { ApiError, getFilterOptions, type FilterOptions } from '../lib/api';
import { FilterBar } from './FilterBar';

/** Fetches the filter options on the server (the browser never calls the API). */
export async function FilterBarLoader() {
  await connection();
  let options: FilterOptions;
  try {
    options = await getFilterOptions();
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : 'unknown error';
    return (
      <p role="alert" className="error">
        Filters unavailable: {msg}.
      </p>
    );
  }
  return (
    <>
      <FilterBar options={options} />
      {options.period && (
        <p className="note">
          The data covers {options.period.from} to {options.period.to} only. The
          first and last months are partial months.
        </p>
      )}
    </>
  );
}
