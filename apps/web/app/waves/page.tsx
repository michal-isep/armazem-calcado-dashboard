import Link from 'next/link';
import { Suspense } from 'react';
import {
  getMonthlyTrend,
  getOrderSize,
  getWaveDistribution,
  getWaveList,
  getWaveSplit,
  type MonthIndicators,
  type WaveList,
} from '../lib/api';
import { ApiProblem } from '../components/ApiProblem';
import { CardFilters } from '../components/CardFilters';
import { Comparison, KpiCard } from '../components/Kpi';
import { TrendChart } from '../components/TrendChart';
import { attempt } from '../lib/attempt';
import { filtersFromSearchParams, filtersToQuery } from '../lib/filters';
import {
  formatDateTime,
  formatInt,
  formatMonth,
  formatPercent,
  formatRatio,
} from '../lib/format';

const basisOf = (orders: number, lines: number) =>
  `${formatInt(orders)} orders, ${formatInt(lines)} lines`;

const param = (v: string | string[] | undefined) =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

function partialNote(months: MonthIndicators[]) {
  const partial = months.filter((m) => m.partial);
  if (partial.length === 0) return null;
  return (
    <p className="note">
      Partial months in the data:{' '}
      {partial
        .map(
          (m) =>
            `${formatMonth(m.month)} (${m.daysCovered} of ${m.daysInMonth} days)`,
        )
        .join(', ')}
      . Compare them with care.
    </p>
  );
}

function WaveTable({ list, query }: { list: WaveList; query: string }) {
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `/waves?${q.toString()}`;
  };
  const sortLink = (sort: WaveList['sort']) =>
    href({
      sort,
      order: list.sort === sort && list.order === 'asc' ? 'desc' : 'asc',
    });
  const arrow = (sort: WaveList['sort']) =>
    list.sort === sort ? (list.order === 'asc' ? ' ▲' : ' ▼') : '';
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const keep = { sort: list.sort, order: list.order };
  const first = (list.page - 1) * list.pageSize + 1;

  return (
    <>
      <p className="note">
        {formatInt(list.total)} waves match. Showing{' '}
        {list.waves.length === 0
          ? 'none'
          : `${formatInt(first)} to ${formatInt(first + list.waves.length - 1)}`}
        ; page {formatInt(list.page)} of {formatInt(pages)}.
      </p>
      {list.waves.length === 0 ? (
        <p>
          {list.total === 0
            ? 'No waves match the filters.'
            : 'This page is past the last wave.'}
        </p>
      ) : (
        <table className="wave-table">
          <thead>
            <tr>
              <th scope="col">
                <Link href={sortLink('waveNumber')}>
                  Wave{arrow('waveNumber')}
                </Link>
              </th>
              <th scope="col">Orders</th>
              <th scope="col">Lines</th>
              <th scope="col">Units</th>
              <th scope="col">
                <Link href={sortLink('firstCreatedAt')}>
                  Orders created (first to last){arrow('firstCreatedAt')}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.waves.map((w) => (
              <tr key={w.waveNumber}>
                <th scope="row">
                  <Link
                    href={`/waves/${encodeURIComponent(w.waveNumber)}${query ? `?${query}` : ''}`}
                  >
                    {w.waveNumber}
                  </Link>
                </th>
                <td>{formatInt(w.orders)}</td>
                <td>{formatInt(w.lines)}</td>
                <td>{formatInt(w.units)}</td>
                <td>
                  {formatDateTime(w.firstCreatedAt)} to{' '}
                  {formatDateTime(w.lastCreatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <nav className="pager" aria-label="Wave list pages">
        {list.page > 1 ? (
          <Link href={href({ ...keep, page: String(list.page - 1) })}>
            Previous
          </Link>
        ) : (
          <span className="greyed">Previous</span>
        )}
        {list.page < pages ? (
          <Link href={href({ ...keep, page: String(list.page + 1) })}>
            Next
          </Link>
        ) : (
          <span className="greyed">Next</span>
        )}
      </nav>
    </>
  );
}

async function WavesAndOrders({
  searchParams,
}: {
  searchParams: PageProps<'/waves'>['searchParams'];
}) {
  const raw = await searchParams;
  const filters = filtersFromSearchParams(raw);
  const paging = {
    page: param(raw.page),
    sort: param(raw.sort),
    order: param(raw.order),
  };
  const [size, split, trend, list, dist] = await Promise.all([
    attempt(getOrderSize(filters)),
    attempt(getWaveSplit(filters)),
    attempt(getMonthlyTrend(filters)),
    attempt(getWaveList(filters, paging)),
    attempt(getWaveDistribution(filters)),
  ]);
  const months = trend.data?.months ?? [];
  const compare = (
    pick: Parameters<typeof Comparison>[0]['pick'],
    format: (n: number | null) => string,
  ) =>
    trend.data ? (
      <Comparison trend={trend.data} pick={pick} format={format} />
    ) : (
      <ApiProblem what="Comparison" error={trend.error} />
    );
  const noOrders = (orders: number | undefined) =>
    orders === 0 && (
      <p className="kpi-compare">No order matches the filters.</p>
    );

  return (
    <>
      <div className="kpi-grid">
        <KpiCard
          id="M3"
          title="Average orders per wave"
          source="customer_order"
          report={split.data?.filters}
          basis={
            split.data
              ? `${basisOf(split.data.orders, split.data.lines)}, ${formatInt(split.data.waves)} waves`
              : undefined
          }
        >
          {split.data ? (
            <>
              <p className="kpi-value">
                {formatRatio(split.data.m3AverageOrdersPerWave)}{' '}
                <small>orders per wave</small>
              </p>
              {noOrders(split.data.orders)}
              {compare((p) => p.m3AverageOrdersPerWave, formatRatio)}
            </>
          ) : (
            <ApiProblem what="M3" error={split.error} />
          )}
        </KpiCard>

        <KpiCard
          id="X1"
          title="Lines per order"
          source="customer_order"
          report={size.data?.filters}
          basis={
            size.data ? basisOf(size.data.orders, size.data.lines) : undefined
          }
        >
          {size.data ? (
            <>
              <p className="kpi-value">
                {formatRatio(size.data.x1LinesPerOrder)}{' '}
                <small>lines per order</small>
              </p>
              {noOrders(size.data.orders)}
              {compare((p) => p.x1LinesPerOrder, formatRatio)}
            </>
          ) : (
            <ApiProblem what="X1" error={size.error} />
          )}
        </KpiCard>

        <KpiCard
          id="X2"
          title="Orders split across waves"
          source="customer_order"
          report={split.data?.filters}
          basis={
            split.data
              ? basisOf(split.data.orders, split.data.lines)
              : undefined
          }
        >
          {split.data ? (
            <>
              <p className="kpi-value">
                {formatPercent(split.data.x2SplitOrdersPercent)}{' '}
                <small>of orders</small>
              </p>
              {noOrders(split.data.orders)}
              {compare((p) => p.x2SplitOrdersPercent, formatPercent)}
            </>
          ) : (
            <ApiProblem what="X2" error={split.error} />
          )}
        </KpiCard>
      </div>

      <section className="card" aria-labelledby="wave-trend-title">
        <h3 id="wave-trend-title">Monthly trend</h3>
        {trend.data ? (
          <>
            <p className="note">
              Source: Customer_Order. Months marked * (partial) are not covered
              by the data in full. A month without matching orders is left
              empty, not drawn as zero.
            </p>
            {partialNote(months)}
            {months.length === 0 ? (
              <p>No orders match the filters.</p>
            ) : (
              <div className="trend-grid">
                <TrendChart
                  title="M3 average orders per wave"
                  field="m3AverageOrdersPerWave"
                  months={months}
                />
                <TrendChart
                  title="X1 lines per order"
                  field="x1LinesPerOrder"
                  months={months}
                />
                <TrendChart
                  title="X2 orders split across waves"
                  field="x2SplitOrdersPercent"
                  unit="%"
                  months={months}
                />
              </div>
            )}
          </>
        ) : (
          <ApiProblem what="The monthly trend" error={trend.error} />
        )}
      </section>

      <section className="card" aria-labelledby="wave-dist-title">
        <h3 id="wave-dist-title">
          <span className="kpi-id">X6</span> Wave size distribution
        </h3>
        {dist.data ? (
          dist.data.waves === 0 ? (
            <p>No orders match the filters.</p>
          ) : (
            <>
              <p className="note">
                The average (M3,{' '}
                {formatRatio(split.data?.m3AverageOrdersPerWave ?? null)} orders
                per wave) hides the spread. {formatInt(dist.data.waves)} waves
                carry {formatInt(dist.data.waveOrderPairs)} order placements; an
                order split across waves counts once in each.
              </p>
              <table className="data">
                <caption>Waves by number of distinct orders they carry</caption>
                <thead>
                  <tr>
                    <th scope="col">Orders in the wave</th>
                    <th scope="col">Waves</th>
                    <th scope="col">Share of waves</th>
                    <th scope="col">Order placements</th>
                    <th scope="col">Share of placements</th>
                  </tr>
                </thead>
                <tbody>
                  {dist.data.sizes.map((b) => (
                    <tr key={b.label}>
                      <th scope="row">{b.label}</th>
                      <td>{formatInt(b.waves)}</td>
                      <td>{formatPercent(b.sharePercentOfWaves)}</td>
                      <td>{formatInt(b.orderPlacements)}</td>
                      <td>{formatPercent(b.sharePercentOfPlacements)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="data">
                <caption>
                  Most common wave sizes in units (a wave has between{' '}
                  {formatInt(dist.data.unitsPerWave.minUnits ?? 0)} and{' '}
                  {formatInt(dist.data.unitsPerWave.maxUnits ?? 0)} units)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Units in the wave</th>
                    <th scope="col">Waves</th>
                    <th scope="col">Share of waves</th>
                  </tr>
                </thead>
                <tbody>
                  {dist.data.unitsPerWave.topSizes.map((t) => (
                    <tr key={t.units}>
                      <th scope="row">{formatInt(t.units)}</th>
                      <td>{formatInt(t.waves)}</td>
                      <td>{formatPercent(t.sharePercentOfWaves)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="data">
                <caption>
                  Split orders (X2): {formatInt(dist.data.splitOrders.total)} of{' '}
                  {formatInt(dist.data.orders)} orders (
                  {formatPercent(dist.data.splitOrders.sharePercentOfOrders)}),
                  by number of waves they are spread over
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Spread over</th>
                    <th scope="col">Orders</th>
                    <th scope="col">Share of split orders</th>
                  </tr>
                </thead>
                <tbody>
                  {dist.data.splitOrders.byWaves.map((b) => (
                    <tr key={b.label}>
                      <th scope="row">{b.label}</th>
                      <td>{formatInt(b.orders)}</td>
                      <td>{formatPercent(b.sharePercentOfSplitOrders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        ) : (
          <ApiProblem what="The wave size distribution" error={dist.error} />
        )}
        <CardFilters source="customer_order" report={dist.data?.filters} />
      </section>

      <section className="card" aria-labelledby="wave-list-title">
        <h3 id="wave-list-title">Waves</h3>
        {list.data ? (
          <>
            <p className="note">{list.data.note}</p>
            <WaveTable list={list.data} query={filtersToQuery(filters)} />
          </>
        ) : (
          <ApiProblem what="The wave list" error={list.error} />
        )}
        <CardFilters source="customer_order" report={list.data?.filters} />
      </section>
    </>
  );
}

export default function WavesPage({ searchParams }: PageProps<'/waves'>) {
  return (
    <>
      <h2>Waves and orders</h2>
      <Suspense fallback={<p>Loading waves...</p>}>
        <WavesAndOrders searchParams={searchParams} />
      </Suspense>
    </>
  );
}
