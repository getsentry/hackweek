import {useEffect, useState} from 'react';

interface HealthResponse {
  ok: boolean;
}

type PlatformStatus = 'checking' | 'ready' | 'unavailable';

export function App() {
  const [status, setStatus] = useState<PlatformStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', {signal: controller.signal})
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        return response.json() as Promise<HealthResponse>;
      })
      .then((result) => setStatus(result.ok ? 'ready' : 'unavailable'))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setStatus('unavailable');
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="shell">
      <div className="aurora auroraOne" />
      <div className="aurora auroraTwo" />
      <section className="hero" aria-labelledby="page-title">
        <div className="eyebrow">
          <span className={`statusDot statusDot--${status}`} aria-hidden="true" />
          Platform {status}
        </div>
        <p className="year">Hackweek</p>
        <h1 id="page-title">
          Make room for
          <span>the improbable.</span>
        </h1>
        <p className="lede">
          One week to step outside the roadmap, follow an idea, and build something worth
          showing the whole company.
        </p>
        <div className="foundation" aria-label="Platform foundation">
          <span>React</span>
          <span>Hono</span>
          <span>Cloudflare Workers</span>
        </div>
      </section>
      <aside className="dispatch" aria-label="Hackweek dispatch">
        <span className="dispatchNumber">01</span>
        <p>Foundation online</p>
        <small>The next edition is taking shape.</small>
      </aside>
    </main>
  );
}
