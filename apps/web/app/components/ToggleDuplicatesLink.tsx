'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { withFilter } from '../lib/filters';

/** Flips the duplicates toggle, the same one as in the filter bar. */
export function ToggleDuplicatesLink({ excluded }: { excluded: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const q = withFilter(params, 'excludeDuplicates', excluded ? null : 'true');
  return (
    <Link href={q ? `${pathname}?${q}` : pathname}>
      {excluded ? 'Include them again' : 'Exclude them'}
    </Link>
  );
}
