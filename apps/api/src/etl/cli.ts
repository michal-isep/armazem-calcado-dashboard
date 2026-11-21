import { resolve } from 'node:path';
import pg from 'pg';
import { runEtl } from './load.js';

// Usage: npm run etl [-- <data-dir>]   (default: ../../data, or $DATA_DIR)
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dir = resolve(process.argv[2] ?? process.env.DATA_DIR ?? '../../data');

  const pool = new pg.Pool({ connectionString: url });
  try {
    const s = await runEtl(pool, {
      customerOrder: resolve(dir, 'Customer_Order.csv'),
      pickingWave: resolve(dir, 'Picking_Wave.csv'),
      product: resolve(dir, 'Product.csv'),
      storageLocation: resolve(dir, 'Storage_Location.csv'),
    });
    console.log(`ETL done from ${dir}`);
    for (const [metric, value] of Object.entries(s)) {
      console.log(`${metric.padEnd(42)} ${value.toLocaleString('en-US')}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`ETL failed: ${(e as Error).message}`);
  process.exit(1);
});
