import { Suspense } from 'react';
import { connection } from 'next/server';
import { CardFilters } from './components/CardFilters';

async function fetchHealth(apiUrl: string): Promise<string> {
  try {
    const res = await fetch(`${apiUrl}/health`, { cache: 'no-store' });
    return `${res.status} ${JSON.stringify(await res.json())}`;
  } catch {
    return 'API unreachable';
  }
}

async function ApiHealth() {
  await connection();
  const apiUrl = process.env.API_URL;
  const health = apiUrl ? await fetchHealth(apiUrl) : 'API_URL is not set';
  return <p>API health: {health}</p>;
}

export default function Home() {
  return (
    <>
      <h2>Overview</h2>
      <Suspense fallback={<p>Checking API...</p>}>
        <ApiHealth />
      </Suspense>
      <p>KPI cards, monthly trend and data quality panel: issue #17.</p>
      <section className="card">
        <h3>Filter check (placeholder until #17)</h3>
        <p>How the active filters show on a card of each source file:</p>
        <Suspense fallback={null}>
          <CardFilters source="customer_order" />
          <CardFilters source="picking_wave" />
        </Suspense>
      </section>
    </>
  );
}
