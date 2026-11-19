import { Suspense } from 'react';
import { connection } from 'next/server';

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
    <main>
      <h1>Warehouse operations dashboard</h1>
      <Suspense fallback={<p>Checking API...</p>}>
        <ApiHealth />
      </Suspense>
    </main>
  );
}
