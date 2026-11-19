import { formatInt, formatRatio } from '../lib/format';
import type { DataQuality, OrderSize } from '../lib/api';
import { ToggleDuplicatesLink } from './ToggleDuplicatesLink';

/**
 * Collapsible data quality panel (spec section 6). The counts are facts about
 * the loaded files and ignore the filters; the duplicates comparison follows
 * the other filters.
 */
export function DataQualityPanel(props: {
  quality: DataQuality | null;
  /** Order size with duplicates kept and with them excluded, same filters. */
  withDuplicates: OrderSize | null;
  withoutDuplicates: OrderSize | null;
  excludeDuplicates: boolean;
}) {
  const {
    quality: q,
    withDuplicates: kept,
    withoutDuplicates: dropped,
  } = props;
  return (
    <details className="card quality">
      <summary>
        <h3>Data quality</h3>
      </summary>
      {!q ? (
        <p role="alert" className="error">
          Data quality counts unavailable.
        </p>
      ) : (
        <>
          <h4>
            Excluded or flagged rows (Customer_Order,{' '}
            {formatInt(q.customerOrder.rows)} rows)
          </h4>
          <table>
            <tbody>
              <tr>
                <th scope="row">Quantity 0, excluded from every indicator</th>
                <td>{formatInt(q.customerOrder.excludedQuantityZero)}</td>
              </tr>
              <tr>
                <th scope="row">Blank size, kept as &quot;unknown&quot;</th>
                <td>{formatInt(q.customerOrder.blankSizeUnknown)}</td>
              </tr>
              <tr>
                <th scope="row">Exact duplicate lines, kept by default</th>
                <td>{formatInt(q.customerOrder.exactDuplicates)}</td>
              </tr>
            </tbody>
          </table>

          <h4>Duplicates toggle</h4>
          <p>
            Duplicates are {props.excludeDuplicates ? 'excluded' : 'included'}{' '}
            now. <ToggleDuplicatesLink excluded={props.excludeDuplicates} />
          </p>
          {kept && dropped ? (
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Included</th>
                  <th>Excluded</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">M2 average order size</th>
                  <td>{formatRatio(kept.m2AverageOrderSize)}</td>
                  <td>{formatRatio(dropped.m2AverageOrderSize)}</td>
                </tr>
                <tr>
                  <th scope="row">X1 lines per order</th>
                  <td>{formatRatio(kept.x1LinesPerOrder)}</td>
                  <td>{formatRatio(dropped.x1LinesPerOrder)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="error">Duplicate comparison unavailable.</p>
          )}
          <p className="note">M1 (ABC) is not part of this comparison.</p>

          <h4>The two source files disagree</h4>
          <p className="note">
            Customer_Order and Picking_Wave do not reconcile, and the dashboard
            does not reconcile them (ADR 0004). Neither file is declared right.{' '}
            {formatInt(q.sourceDisagreement.wavesMissingFromPicking)} of{' '}
            {formatInt(q.sourceDisagreement.wavesInOrders)} waves in
            Customer_Order are missing from Picking_Wave, and Picking_Wave has{' '}
            {formatInt(q.sourceDisagreement.unitsDifference)} fewer units (
            {formatInt(q.sourceDisagreement.pickUnits)} picked against{' '}
            {formatInt(q.sourceDisagreement.orderUnits)} ordered). Aisle figures
            are therefore approximate. Picking_Wave also has no order number, so
            picks cannot be tied to orders.
          </p>
        </>
      )}
    </details>
  );
}
