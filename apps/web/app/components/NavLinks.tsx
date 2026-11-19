'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { filtersFromUrl, filtersToQuery } from '../lib/filters';

const PAGES = [
  { href: '/', label: 'Overview' },
  { href: '/products', label: 'Products (ABC)' },
  { href: '/waves', label: 'Waves and orders' },
  { href: '/zones', label: 'Warehouse zones' },
];

/** Navigation that carries the filters along, so they survive a page change. */
export function NavLinks() {
  const pathname = usePathname();
  const query = filtersToQuery(filtersFromUrl(useSearchParams()));
  return (
    <nav aria-label="Pages" className="nav">
      {PAGES.map((p) => (
        <Link
          key={p.href}
          href={query ? `${p.href}?${query}` : p.href}
          aria-current={pathname === p.href ? 'page' : undefined}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
