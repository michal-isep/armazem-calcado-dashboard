import Link from 'next/link';
import { Suspense } from 'react';
import {
  ApiError,
  getWaveDetail,
  type WaveDetail,
  type WaveOrderEntry,
  type WavePick,
} from '../../lib/api';
import {
  FILTER_LABEL,
  filtersFromSearchParams,
  filtersToQuery,
} from '../../lib/filters';
import { formatDateTime, formatInt, formatSigned } from '../../lib/format';

const UNIT_CHECK_LABEL: Record<WaveDetail['unitCheck']['status'], string> = {
  match: 'Units match',
  mismatch: 'Units differ',
  'not-comparable': 'Units not comparable',
};

function BackLink({ query }: { query: string }) {
  return (
    <p>
      <Link href={`/waves${query ? `?${query}` : ''}`}>
        Back to waves and orders
      </Link>
    </p>
  );
}

function OrdersList({ wave }: { wave: WaveDetail['orders'] }) {
  return (
    <section className="card" aria-labelledby="wave-orders-title">
      <h3 id="wave-orders-title">Orders</h3>
      <p className="note">
        Source: {wave.source}. {formatInt(wave.totals.orders)} orders,{' '}
        {formatInt(wave.totals.lines)} lines, {formatInt(wave.totals.units)}{' '}
        units. An order split across waves shows only its lines in this wave.
      </p>
      {wave.note && <p className="note">{wave.note}</p>}
      {wave.orders.length > 0 && (
        <details open>
          <summary>
            {formatInt(wave.orders.length)} orders (show or hide)
          </summary>
          <div className="scroll-table" tabIndex={0}>
            <table className="wave-table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Created</th>
                  <th scope="col">Operator</th>
                  <th scope="col">Lines</th>
                  <th scope="col">Units</th>
                  <th scope="col">Items (reference, size, quantity)</th>
                </tr>
              </thead>
              <tbody>
                {wave.orders.map((o: WaveOrderEntry) => (
                  <tr key={o.orderNumber}>
                    <th scope="row">{o.orderNumber}</th>
                    <td>{o.customer}</td>
                    <td>{formatDateTime(o.createdAt)}</td>
                    <td>{o.operator ?? o.operators.join(', ')}</td>
                    <td>{formatInt(o.lines)}</td>
                    <td>{formatInt(o.units)}</td>
                    <td>
                      <ul className="item-list">
                        {o.items.map((item, i) => (
                          <li key={i}>
                            {item.reference}, size {item.size || 'unknown'},
                            quantity {formatInt(item.quantity)}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function PicksList({ wave }: { wave: WaveDetail['picks'] }) {
  return (
    <section className="card" aria-labelledby="wave-picks-title">
      <h3 id="wave-picks-title">Picks</h3>
      <p className="note">
        Source: {wave.source}. {formatInt(wave.totals.picks)} picks,{' '}
        {formatInt(wave.totals.units)} units.
      </p>
      {wave.note && <p className="note">{wave.note}</p>}
      {wave.picks.length > 0 && (
        <details open>
          <summary>{formatInt(wave.picks.length)} picks (show or hide)</summary>
          <div className="scroll-table" tabIndex={0}>
            <table className="wave-table">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Size</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Location</th>
                  <th scope="col">Aisle</th>
                  <th scope="col">Operator</th>
                </tr>
              </thead>
              <tbody>
                {wave.picks.map((p: WavePick, i) => (
                  <tr key={i}>
                    <th scope="row">{p.reference}</th>
                    <td>{p.size || 'unknown'}</td>
                    <td>{formatInt(p.quantity)}</td>
                    <td>{p.location}</td>
                    <td>{p.aisle}</td>
                    <td>{p.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function Detail({ wave }: { wave: WaveDetail }) {
  const check = wave.unitCheck;
  const dup = wave.filters.excludeDuplicates;
  return (
    <>
      <section className="card" aria-labelledby="wave-check-title">
        <h3 id="wave-check-title">Units in the two files</h3>
        <p>
          <span className="badge">{UNIT_CHECK_LABEL[check.status]}</span>{' '}
          Customer_Order:{' '}
          {wave.orders.inFile
            ? `${formatInt(check.orderUnits)} units`
            : 'no rows'}
          . Picking_Wave:{' '}
          {wave.picks.inFile
            ? `${formatInt(check.pickUnits)} units`
            : 'no rows'}
          .
          {check.difference !== null &&
            ` Difference (Picking_Wave minus Customer_Order): ${formatSigned(check.difference)}.`}
        </p>
        <p className="note">{check.note}</p>
        <p className="note">{wave.coverageNote}</p>
        <p className="note">{wave.linkNote}</p>
      </section>

      <div className="wave-lists">
        <OrdersList wave={wave.orders} />
        <PicksList wave={wave.picks} />
      </div>

      <section className="card-filters" aria-label="Filters on this wave">
        <ul>
          <li>
            {FILTER_LABEL.excludeDuplicates}: {dup.requested ? 'on' : 'off'}
            <small> (applies to {dup.appliesTo})</small>
          </li>
          {wave.filters.notApplied.map((f) => (
            <li key={f.filter} className="greyed">
              {FILTER_LABEL[f.filter]}: active
              <small> (not applied: {f.reason})</small>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

async function WaveDetailLoader({
  params,
  searchParams,
}: {
  params: PageProps<'/waves/[waveNumber]'>['params'];
  searchParams: PageProps<'/waves/[waveNumber]'>['searchParams'];
}) {
  const { waveNumber } = await params;
  const filters = filtersFromSearchParams(await searchParams);
  const query = filtersToQuery(filters);

  let wave: WaveDetail;
  try {
    wave = await getWaveDetail(waveNumber, filters);
  } catch (e) {
    const error = e instanceof ApiError ? e : new ApiError('Request failed');
    const what =
      error.status === 404
        ? `Wave ${waveNumber} not found`
        : error.status === 400
          ? 'The request was not valid'
          : `Wave ${waveNumber} unavailable`;
    return (
      <>
        <h2>Wave {waveNumber}</h2>
        <p role="alert" className="error">
          {what}. {error.message}
        </p>
        <BackLink query={query} />
      </>
    );
  }

  return (
    <>
      <h2>Wave {wave.waveNumber}</h2>
      <BackLink query={query} />
      <Detail wave={wave} />
    </>
  );
}

export default function WaveDetailPage({
  params,
  searchParams,
}: PageProps<'/waves/[waveNumber]'>) {
  return (
    <Suspense fallback={<h2>Loading wave...</h2>}>
      <WaveDetailLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}
