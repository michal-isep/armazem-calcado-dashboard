import { Suspense } from 'react';
import { AbcControls } from '../components/AbcControls';
import { CardFilters } from '../components/CardFilters';
import { abcApiQuery, BASIS_LABEL, viewFromSearchParams } from '../lib/abc';
import { getAislePicks, type AisleEntry, type PickClass } from '../lib/api';
import { filtersFromSearchParams } from '../lib/filters';
import { formatInt, formatPercent } from '../lib/format';

const CLASSES: PickClass[] = ['A', 'B', 'C', 'unclassified'];
const classLabel = (c: PickClass) =>
  c === 'unclassified' ? 'No class' : `Class ${c}`;

function ProxyTag() {
  return (
    <p className="badge" role="note">
      Proxy, not Sector: aisle is the first letter of the pick location
    </p>
  );
}

function AisleRows({ aisles }: { aisles: AisleEntry[] }) {
  return aisles.map((a) => (
    <tr key={a.aisle}>
      <th scope="row">{a.aisle}</th>
      <td>{formatInt(a.picks)}</td>
      <td>{formatInt(a.units)}</td>
      <td>{formatPercent(a.sharePercent)}</td>
      {CLASSES.map((c) => (
        <td key={c}>{formatInt(a.byClass[c].picks)}</td>
      ))}
    </tr>
  ));
}

function AisleHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Aisle</th>
        <th scope="col">Picks</th>
        <th scope="col">Units</th>
        <th scope="col">Share of picks</th>
        {CLASSES.map((c) => (
          <th scope="col" key={c}>
            Picks, {c === 'unclassified' ? 'no class' : `class ${c}`}
          </th>
        ))}
      </tr>
    </thead>
  );
}

async function Zones({
  searchParams,
}: {
  searchParams: PageProps<'/zones'>['searchParams'];
}) {
  const raw = await searchParams;
  const filters = filtersFromSearchParams(raw);
  const { view, ignored } = viewFromSearchParams(raw);
  let data: Awaited<ReturnType<typeof getAislePicks>> | null = null;
  let error = '';
  try {
    data = await getAislePicks(abcApiQuery(filters, view));
  } catch (e) {
    error = e instanceof Error ? e.message : 'Request failed';
  }

  return (
    <>
      {ignored.length > 0 && (
        <p role="alert" className="error">
          Ignored invalid page settings (defaults used): {ignored.join(', ')}.
        </p>
      )}
      <p className="note" role="note">
        {data?.coverageNote ??
          'Picking_Wave covers about 94% of ordered units; the two files are not reconciled (ADR 0004), so aisle figures are approximate.'}{' '}
        Picking_Wave has no order number, so picks cannot be tied to orders (ADR
        0005).
      </p>

      <section className="card" aria-labelledby="aisle-title">
        <h3 id="aisle-title">
          <span className="kpi-id">X3</span> <span className="kpi-id">A1</span>{' '}
          Picks by aisle
        </h3>
        <ProxyTag />
        <p className="basis-banner" role="status">
          ABC classes use the basis <strong>{BASIS_LABEL[view.basis]}</strong>,
          thresholds {view.thresholdA}/{view.thresholdB}, ranked on the date
          range only (ADR 0002). Effort is the number of picks; units are
          secondary. Source: Picking_Wave.
        </p>
        <AbcControls
          key={`${view.thresholdA}-${view.thresholdB}`}
          basis={view.basis}
          thresholdA={view.thresholdA}
          thresholdB={view.thresholdB}
        />
        {data ? (
          <>
            {data.totals.picks === 0 ? (
              <p>No picks match the filters.</p>
            ) : (
              <table className="data">
                <caption>
                  A1 aisle share of picks and X3 picks by aisle and ABC class (
                  {formatInt(data.totals.picks)} picks,{' '}
                  {formatInt(data.totals.units)} units)
                </caption>
                <AisleHead />
                <tbody>
                  <AisleRows aisles={data.aisles} />
                </tbody>
              </table>
            )}

            {data.unknownAisles.picks > 0 && (
              <>
                <h4>Aisles with unknown meaning</h4>
                <p className="badge" role="note">
                  {data.unknownAisles.label}
                </p>
                <table className="data">
                  <caption>
                    Separate bucket: {formatInt(data.unknownAisles.picks)} picks
                    ({formatPercent(data.unknownAisles.sharePercent)} of picks),{' '}
                    {formatInt(data.unknownAisles.units)} units
                  </caption>
                  <AisleHead />
                  <tbody>
                    <AisleRows aisles={data.unknownAisles.aisles} />
                  </tbody>
                </table>
              </>
            )}
            <CardFilters source="picking_wave" report={data.filters} />
          </>
        ) : (
          <p role="alert" className="error">
            Aisle picks unavailable. {error}
          </p>
        )}
      </section>

      {data && (
        <section className="card" aria-labelledby="class-title">
          <h3 id="class-title">
            <span className="kpi-id">X3</span> Picks by ABC class
          </h3>
          <ProxyTag />
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Picks</th>
                <th scope="col">Units</th>
                <th scope="col">Share of picks</th>
              </tr>
            </thead>
            <tbody>
              {data.classes.map((c) => (
                <tr key={c.abcClass}>
                  <th scope="row">{classLabel(c.abcClass)}</th>
                  <td>{formatInt(c.picks)}</td>
                  <td>{formatInt(c.units)}</td>
                  <td>{formatPercent(c.sharePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <CardFilters source="picking_wave" report={data.filters} />
        </section>
      )}
    </>
  );
}

export default function ZonesPage({ searchParams }: PageProps<'/zones'>) {
  return (
    <>
      <h2>Warehouse zones</h2>
      <Suspense fallback={<p>Loading aisles...</p>}>
        <Zones searchParams={searchParams} />
      </Suspense>
    </>
  );
}
