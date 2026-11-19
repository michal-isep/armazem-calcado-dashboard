import Link from 'next/link';
import { Suspense } from 'react';

// Placeholder for the wave detail view (issue #21). The Waves page links here
// so the route is agreed: /waves/<waveNumber>, backed by GET /waves/:waveNumber
// (issue #15). The detail itself is not built yet.
async function Placeholder({
  params,
}: {
  params: PageProps<'/waves/[waveNumber]'>['params'];
}) {
  const { waveNumber } = await params;
  return (
    <>
      <h2>Wave {waveNumber}</h2>
      <p>Orders and picks of this wave: wave detail view, issue #21.</p>
    </>
  );
}

export default function WaveDetailPage({
  params,
}: PageProps<'/waves/[waveNumber]'>) {
  return (
    <>
      <Suspense fallback={<h2>Wave</h2>}>
        <Placeholder params={params} />
      </Suspense>
      <p>
        <Link href="/waves">Back to waves and orders</Link>
      </p>
    </>
  );
}
