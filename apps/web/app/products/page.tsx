import Link from 'next/link';
import { Suspense } from 'react';
import { AbcControls } from '../components/AbcControls';
import { CardFilters } from '../components/CardFilters';
import { ParetoChart } from '../components/ParetoChart';
import {
  abcApiQuery,
  BASIS_LABEL,
  viewFromSearchParams,
  viewToQuery,
  type AbcView,
} from '../lib/abc';
import { getAbc, getAbcComparison, getAbcSizes } from '../lib/api';
import { filtersFromSearchParams, type FilterValues } from '../lib/filters';
import { formatInt, formatPercent } from '../lib/format';

const settle = <T,>(p: Promise<T>) => p.catch(() => null);

function Unavailable({ what }: { what: string }) {
  return (
    <p role="alert" className="error">
      {what} unavailable: the API did not answer or rejected the filters.
    </p>
  );
}

const href = (filters: FilterValues, view: AbcView) => {
  const q = viewToQuery(filters, view);
  return q ? `/products?${q}` : '/products';
};

async function Products({
  searchParams,
}: {
  searchParams: PageProps<'/products'>['searchParams'];
}) {
  const raw = await searchParams;
  const filters = filtersFromSearchParams(raw);
  const { view, ignored } = viewFromSearchParams(raw);
  const query = abcApiQuery(filters, view);
  const other = (change: Partial<AbcView>) =>
    href(filters, { ...view, drillClass: undefined, drillRef: undefined, ...change });

  const sizeFilters = { ...filters, reference: view.drillRef };
  delete sizeFilters.abcClass;
  const [abc, comparison, sizes] = await Promise.all([
    settle(getAbc(query)),
    settle(getAbcComparison(query)),
    view.drillRef
      ? settle(getAbcSizes(abcApiQuery(sizeFilters, view)))
      : Promise.resolve(undefined),
  ]);

  const basisLabel = BASIS_LABEL[view.basis];
  const inClass = abc?.references.filter(
    (r) => r.abcClass === view.drillClass,
  );

  return (
    <>
      {ignored.length > 0 && (
        <p role="alert" className="error">
          Ignored invalid page settings (defaults used): {ignored.join(', ')}.
        </p>
      )}

      <section className="card" aria-labelledby="abc-basis">
        <h3 id="abc-basis">M1 ABC classification</h3>
        <p className="basis-banner" role="status">
          Active basis: <strong>{basisLabel}</strong>. Thresholds: A while the
          cumulative share before a reference is below{' '}
          <strong>{view.thresholdA}%</strong>, B below{' '}
          <strong>{view.thresholdB}%</strong>, otherwise C.
          {abc &&
            ` Ranked on the date range only: ${formatInt(abc.ranked.references)} references, ${formatInt(abc.ranked.lines)} lines, ${formatInt(abc.ranked.units)} units. Product, class, customer and operator filters select from these classes and never change them.`}
        </p>
        <AbcControls
          key={`${view.thresholdA}-${view.thresholdB}`}
          basis={view.basis}
          thresholdA={view.thresholdA}
          thresholdB={view.thresholdB}
        />
        {abc ? (
          <>
            <ParetoChart abc={abc} />
            <CardFilters source="customer_order" report={abc.filters} />
          </>
        ) : (
          <Unavailable what="The ABC classification" />
        )}
      </section>

      {abc && (
        <section className="card" aria-labelledby="drill-title">
          <h3 id="drill-title">Drill-down</h3>
          <p className="note">
            Class, then the references in it, then the sizes of one reference.
            Shares are of {basisLabel}.
          </p>

          <h4>1. Classes</h4>
          <table className="data">
            <thead>
              <tr>
                <th>Class</th>
                <th>References</th>
                <th>Lines</th>
                <th>Units</th>
                <th>Share of {basisLabel}</th>
              </tr>
            </thead>
            <tbody>
              {abc.classes.map((c) => (
                <tr
                  key={c.abcClass}
                  aria-current={view.drillClass === c.abcClass || undefined}
                >
                  <td>
                    <Link href={other({ drillClass: c.abcClass })}>
                      Class {c.abcClass}
                    </Link>
                  </td>
                  <td>{formatInt(c.references)}</td>
                  <td>{formatInt(c.lines)}</td>
                  <td>{formatInt(c.units)}</td>
                  <td>{formatPercent(c.sharePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {view.drillClass && inClass && (
            <>
              <h4>
                2. References in class {view.drillClass}{' '}
                <small>
                  <Link href={other({})}>close</Link>
                </small>
              </h4>
              {inClass.length === 0 ? (
                <p>No references of this class in the selection.</p>
              ) : (
                <div className="scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Reference</th>
                        <th>Lines</th>
                        <th>Units</th>
                        <th>Share of {basisLabel}</th>
                        <th>Cumulative before</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inClass.map((r) => (
                        <tr
                          key={r.reference}
                          aria-current={view.drillRef === r.reference || undefined}
                        >
                          <td>{r.rank}</td>
                          <td>
                            <Link
                              href={other({
                                drillClass: view.drillClass,
                                drillRef: r.reference,
                              })}
                            >
                              {r.reference}
                            </Link>
                          </td>
                          <td>{formatInt(r.lines)}</td>
                          <td>{formatInt(r.units)}</td>
                          <td>{r.sharePercent.toFixed(2)}%</td>
                          <td>{r.cumulativeBeforePercent.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {view.drillRef && (
            <>
              <h4>
                3. Sizes of {view.drillRef}{' '}
                <small>
                  <Link href={other({ drillClass: view.drillClass })}>
                    close
                  </Link>
                </small>
              </h4>
              {!sizes ? (
                <Unavailable what="The sizes" />
              ) : sizes.sizes.length === 0 ? (
                <p>No valid order lines for this reference in the selection.</p>
              ) : (
                <>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th>Lines</th>
                        <th>Units</th>
                        <th>Share of {basisLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sizes.sizes.map((s) => (
                        <tr key={s.size}>
                          <td>{s.size}</td>
                          <td>{formatInt(s.lines)}</td>
                          <td>{formatInt(s.units)}</td>
                          <td>{s.sharePercent.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="note">
                    Sizes are opaque labels as written in Customer_Order;
                    &quot;unknown&quot; is the 16 rows with a blank size.
                  </p>
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="x4-title">
        <h3 id="x4-title">X4 Computed ABC vs Product.ABCCOD</h3>
        <p className="basis-banner">
          Computed with the active basis: <strong>{basisLabel}</strong>,
          thresholds {view.thresholdA}/{view.thresholdB}.
        </p>
        {comparison ? (
          <>
            <p className="badge" role="note">
              {comparison.abccodNote}
            </p>
            <p className="kpi-value">
              {formatPercent(comparison.summary.matchPercent)}{' '}
              <small>
                match: {formatInt(comparison.summary.matches)} of{' '}
                {formatInt(comparison.summary.compared)} compared products (
                {formatInt(comparison.summary.mismatches)} mismatches)
              </small>
            </p>
            <p className="note">
              {formatInt(comparison.summary.notRanked)} of{' '}
              {formatInt(comparison.summary.products)} selected products are not
              ranked. {comparison.notRankedNote}
            </p>
            <details>
              <summary>Per product</summary>
              <div className="scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Computed</th>
                      <th>ABCCOD</th>
                      <th>Status</th>
                      <th>Lines</th>
                      <th>Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.references.map((r) => (
                      <tr key={r.reference}>
                        <td>{r.reference}</td>
                        <td>{r.computedClass ?? 'not ranked'}</td>
                        <td>{r.abccod}</td>
                        <td>{r.status}</td>
                        <td>{formatInt(r.lines)}</td>
                        <td>{formatInt(r.units)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <CardFilters source="customer_order" report={comparison.filters} />
          </>
        ) : (
          <Unavailable what="The X4 comparison" />
        )}
      </section>
    </>
  );
}

export default function ProductsPage({
  searchParams,
}: PageProps<'/products'>) {
  return (
    <>
      <h2>Products (ABC)</h2>
      <Suspense fallback={<p>Loading ABC classification...</p>}>
        <Products searchParams={searchParams} />
      </Suspense>
    </>
  );
}
