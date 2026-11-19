import Link from 'next/link';
import { Suspense } from 'react';
import {
  getDataQuality,
  getMonthlyTrend,
  getOrderSize,
  getSector,
  getWaveSplit,
} from './lib/api';
import { attempt } from './lib/attempt';
import { filtersFromSearchParams } from './lib/filters';
import { formatInt, formatPercent, formatRatio } from './lib/format';
import { ApiProblem } from './components/ApiProblem';
import { DataQualityPanel } from './components/DataQualityPanel';
import { Comparison, KpiCard, NotInformativeBadge } from './components/Kpi';
import { TrendChart } from './components/TrendChart';

const basisOf = (orders: number, lines: number) =>
  `${formatInt(orders)} orders, ${formatInt(lines)} lines`;

async function Overview({
  searchParams,
}: {
  searchParams: PageProps<'/'>['searchParams'];
}) {
  const filters = filtersFromSearchParams(await searchParams);
  const rest = { ...filters };
  delete rest.excludeDuplicates;
  const [sizeR, splitR, sectorR, trendR, qualityR, keptR, droppedR] =
    await Promise.all([
      attempt(getOrderSize(filters)),
      attempt(getWaveSplit(filters)),
      attempt(getSector(filters)),
      attempt(getMonthlyTrend(filters)),
      attempt(getDataQuality()),
      attempt(getOrderSize(rest)),
      attempt(getOrderSize({ ...rest, excludeDuplicates: 'true' })),
    ]);
  const size = sizeR.data ?? null;
  const split = splitR.data ?? null;
  const sector = sectorR.data ?? null;
  const trend = trendR.data ?? null;
  const quality = qualityR.data ?? null;
  const kept = keptR.data ?? null;
  const dropped = droppedR.data ?? null;

  return (
    <>
      <div className="kpi-grid">
        <KpiCard id="M1" title="ABC classification" source="customer_order">
          <p className="kpi-basis">
            The classes are computed from order lines, not read from
            Product.ABCCOD. See the <Link href="/products">Products page</Link>{' '}
            for the classes and the comparison with ABCCOD.
          </p>
        </KpiCard>

        <KpiCard
          id="M2"
          title="Average order size"
          source="customer_order"
          report={size?.filters}
          basis={size ? basisOf(size.orders, size.lines) : undefined}
        >
          {size ? (
            <>
              <p className="kpi-value">
                {formatRatio(size.m2AverageOrderSize)}{' '}
                <small>units per order</small>
              </p>
              <Comparison
                trend={trend}
                pick={(p) => p.m2AverageOrderSize}
                format={formatRatio}
              />
            </>
          ) : (
            <ApiProblem what="M2" error={sizeR.error ?? ''} />
          )}
        </KpiCard>

        <KpiCard
          id="M3"
          title="Average orders per wave"
          source="customer_order"
          report={split?.filters}
          basis={
            split
              ? `${basisOf(split.orders, split.lines)}, ${formatInt(split.waves)} waves`
              : undefined
          }
        >
          {split ? (
            <>
              <p className="kpi-value">
                {formatRatio(split.m3AverageOrdersPerWave)}{' '}
                <small>orders per wave</small>
              </p>
              <Comparison
                trend={trend}
                pick={(p) => p.m3AverageOrdersPerWave}
                format={formatRatio}
              />
            </>
          ) : (
            <ApiProblem what="M3" error={splitR.error ?? ''} />
          )}
        </KpiCard>

        <KpiCard
          id="M4"
          title="Sector share"
          source="customer_order"
          report={sector?.filters}
          badge={sector?.notInformative ? <NotInformativeBadge /> : undefined}
          basis={
            sector
              ? `${basisOf(sector.orders, sector.lines)}, ${formatInt(sector.units)} units`
              : undefined
          }
        >
          {sector ? (
            sector.m4SectorShare.length === 0 ? (
              <p className="kpi-value">no data</p>
            ) : (
              <ul className="kpi-list">
                {sector.m4SectorShare.map((s) => (
                  <li key={s.sector}>
                    {s.sector}: {formatPercent(s.sharePercent)} of units
                  </li>
                ))}
              </ul>
            )
          ) : (
            <ApiProblem what="M4" error={sectorR.error ?? ''} />
          )}
        </KpiCard>

        <KpiCard
          id="M5"
          title="Multi-sector orders"
          source="customer_order"
          report={sector?.filters}
          badge={sector?.notInformative ? <NotInformativeBadge /> : undefined}
          basis={sector ? basisOf(sector.orders, sector.lines) : undefined}
        >
          {sector ? (
            <p className="kpi-value">
              {formatPercent(sector.m5MultiSectorOrdersPercent)}{' '}
              <small>of orders</small>
            </p>
          ) : (
            <ApiProblem what="M5" error={sectorR.error ?? ''} />
          )}
        </KpiCard>
      </div>

      <section className="card" aria-labelledby="trend-title">
        <h3 id="trend-title">Monthly trend</h3>
        {trend ? (
          <>
            <p className="note">
              Source: Customer_Order. Months marked * (partial) are not covered
              by the data in full, so compare them with care. A month without
              matching orders is left empty, not drawn as zero.
            </p>
            {trend.months.length === 0 ? (
              <p>No orders match the filters.</p>
            ) : (
              <div className="trend-grid">
                <TrendChart
                  title="M2 average order size"
                  field="m2AverageOrderSize"
                  months={trend.months}
                />
                <TrendChart
                  title="M3 average orders per wave"
                  field="m3AverageOrdersPerWave"
                  months={trend.months}
                />
                <TrendChart
                  title="X1 lines per order"
                  field="x1LinesPerOrder"
                  months={trend.months}
                />
                <TrendChart
                  title="X2 orders split across waves"
                  field="x2SplitOrdersPercent"
                  unit="%"
                  months={trend.months}
                />
              </div>
            )}
          </>
        ) : (
          <ApiProblem what="The monthly trend" error={trendR.error ?? ''} />
        )}
      </section>

      <DataQualityPanel
        quality={quality}
        withDuplicates={kept}
        withoutDuplicates={dropped}
        excludeDuplicates={filters.excludeDuplicates === 'true'}
      />
    </>
  );
}

export default function Home({ searchParams }: PageProps<'/'>) {
  return (
    <>
      <h2>Overview</h2>
      <Suspense fallback={<p>Loading indicators...</p>}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}
