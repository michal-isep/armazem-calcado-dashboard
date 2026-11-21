import { Suspense } from 'react';
import { AbcControls } from '../components/AbcControls';
import { CardFilters } from '../components/CardFilters';
import { abcApiQuery, BASIS_LABEL, viewFromSearchParams } from '../lib/abc';
import {
  getAislePicks,
  getLocationCoverage,
  getShelfPosition,
  type AisleEntry,
  type PickClass,
} from '../lib/api';
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
  const query = abcApiQuery(filters, view);
  try {
    data = await getAislePicks(query);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Request failed';
  }
  // The coverage and position cards fail on their own, so the aisle table
  // above stays usable if they do.
  const [coverageResult, positionResult] = await Promise.allSettled([
    getLocationCoverage(query),
    getShelfPosition(query),
  ]);
  const coverage =
    coverageResult.status === 'fulfilled' ? coverageResult.value : null;
  const position =
    positionResult.status === 'fulfilled' ? positionResult.value : null;
  const reason = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' && r.reason instanceof Error
      ? r.reason.message
      : 'Request failed';
  // Busy aisles whose picks mostly have no coordinates (ADR 0009).
  const hollow =
    data && coverage
      ? coverage.aislesAffected.filter(
          (a) =>
            (a.sharePercentWithout ?? 0) >= 50 &&
            data.aisles.some((x) => x.aisle === a.aisle),
        )
      : [];

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

            {hollow.map((a) => (
              <p className="badge" role="note" key={a.aisle}>
                Aisle {a.aisle}: {formatPercent(a.sharePercentWithout)} of its
                picks are at codes without coordinates (mostly{' '}
                {coverage?.topWithoutCoordinates.find(
                  (w) => w.aisle === a.aisle,
                )?.location ?? 'one code'}
                ), not on a shelf. See Location coverage below (ADR 0009).
              </p>
            ))}

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

      <section className="card" aria-labelledby="coverage-title">
        <h3 id="coverage-title">
          <span className="kpi-id">X8</span> Location coverage
        </h3>
        {coverage ? (
          coverage.totals.picks === 0 ? (
            <p>No picks match the filters.</p>
          ) : (
            <>
              <p className="note" role="note">
                {coverage.note} Source: {coverage.source}.
              </p>
              <table className="data">
                <caption>
                  Picks with and without coordinates (
                  {formatInt(coverage.totals.picks)} picks)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Location</th>
                    <th scope="col">Picks</th>
                    <th scope="col">Units</th>
                    <th scope="col">Share of picks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">
                      With coordinates (a shelf in the layout)
                    </th>
                    <td>{formatInt(coverage.withCoordinates.picks)}</td>
                    <td>{formatInt(coverage.withCoordinates.units)}</td>
                    <td>
                      {formatPercent(coverage.withCoordinates.sharePercent)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Without coordinates</th>
                    <td>{formatInt(coverage.withoutCoordinates.picks)}</td>
                    <td>{formatInt(coverage.withoutCoordinates.units)}</td>
                    <td>
                      {formatPercent(coverage.withoutCoordinates.sharePercent)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {coverage.topWithoutCoordinates.length > 0 && (
                <table className="data">
                  <caption>
                    Codes without coordinates with the most picks (their meaning
                    is unknown)
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Aisle (first letter)</th>
                      <th scope="col">Picks</th>
                      <th scope="col">Share of all picks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.topWithoutCoordinates.map((w) => (
                      <tr key={w.location}>
                        <th scope="row">{w.location}</th>
                        <td>{w.aisle}</td>
                        <td>{formatInt(w.picks)}</td>
                        <td>{formatPercent(w.sharePercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <CardFilters source="picking_wave" report={coverage.filters} />
            </>
          )
        ) : (
          <p role="alert" className="error">
            Location coverage unavailable. {reason(coverageResult)}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="position-title">
        <h3 id="position-title">
          <span className="kpi-id">X7</span> Picks by shelf position
        </h3>
        <p className="badge" role="note">
          Proxy, not distance: the files do not say where the dock is
        </p>
        {position ? (
          position.totals.picks === 0 ? (
            <p>No picks with coordinates match the filters.</p>
          ) : (
            <>
              <p className="basis-banner" role="status">
                ABC classes use the basis{' '}
                <strong>{BASIS_LABEL[view.basis]}</strong>, thresholds{' '}
                {view.thresholdA}/{view.thresholdB}. Only{' '}
                {formatInt(position.totals.picks)} picks with coordinates are
                shown; {formatInt(position.picksWithoutCoordinatesLeftOut)}{' '}
                picks without coordinates are left out (see Location coverage).{' '}
                {position.note}
              </p>
              <table className="data">
                <caption>Picks by band along the y axis (0 to 1,440)</caption>
                <thead>
                  <tr>
                    <th scope="col">Band (y)</th>
                    <th scope="col">Picks</th>
                    <th scope="col">Share of picks</th>
                    <th scope="col">Bar</th>
                    {CLASSES.map((c) => (
                      <th scope="col" key={c}>
                        Picks,{' '}
                        {c === 'unclassified' ? 'no class' : `class ${c}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {position.bands.map((b) => (
                    <tr key={b.band}>
                      <th scope="row">
                        {formatInt(b.yFrom)} to {formatInt(b.yTo)}
                      </th>
                      <td>{formatInt(b.picks)}</td>
                      <td>{formatPercent(b.sharePercent)}</td>
                      <td aria-hidden="true">
                        <span
                          className="share-bar"
                          style={{ width: `${(b.sharePercent ?? 0) * 1.2}px` }}
                        />
                      </td>
                      {CLASSES.map((c) => (
                        <td key={c}>{formatInt(b.byClass[c].picks)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="data">
                <caption>Picks by shelf level (z)</caption>
                <thead>
                  <tr>
                    <th scope="col">Level</th>
                    <th scope="col">Picks</th>
                    <th scope="col">Share of picks</th>
                    {CLASSES.map((c) => (
                      <th scope="col" key={c}>
                        Picks,{' '}
                        {c === 'unclassified' ? 'no class' : `class ${c}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {position.levels.map((l) => (
                    <tr key={l.level}>
                      <th scope="row">{l.level}</th>
                      <td>{formatInt(l.picks)}</td>
                      <td>{formatPercent(l.sharePercent)}</td>
                      {CLASSES.map((c) => (
                        <td key={c}>{formatInt(l.byClass[c].picks)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <CardFilters source="picking_wave" report={position.filters} />
            </>
          )
        ) : (
          <p role="alert" className="error">
            Shelf position unavailable. {reason(positionResult)}
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
