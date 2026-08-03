import {useSession} from './session';

export function App() {
  const session = useSession();

  if (session.status === 'loading') {
    return (
      <AuthState title="Checking your pass" detail="Validating Cloudflare Access…" />
    );
  }

  if (session.status === 'unauthenticated') {
    return (
      <AuthState
        title="Access required"
        detail="Sign in through the company Cloudflare Access page, then reload Hackweek."
      />
    );
  }

  if (session.status === 'forbidden') {
    return (
      <AuthState
        title="Workspace only"
        detail="This Hackweek is limited to authorized company accounts."
      />
    );
  }

  if (session.status === 'error') {
    return (
      <AuthState
        title="Gate unavailable"
        detail="The identity service could not be reached."
      />
    );
  }

  return (
    <main className="shell">
      <div className="aurora auroraOne" />
      <div className="aurora auroraTwo" />
      <section className="hero" aria-labelledby="page-title">
        <div className="eyebrow">
          <span className="statusDot statusDot--ready" aria-hidden="true" />
          Signed in as {session.user.displayName}
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
        <div className="foundation" aria-label="Session authorization">
          <span>{session.user.email}</span>
          <span>{session.user.role === 'admin' ? 'Administrator' : 'Member'}</span>
        </div>
      </section>
      <aside className="dispatch" aria-label="Hackweek dispatch">
        <span className="dispatchNumber">02</span>
        <p>Identity verified</p>
        <small>Roles are enforced by the Worker.</small>
      </aside>
    </main>
  );
}

function AuthState({title, detail}: {title: string; detail: string}) {
  return (
    <main className="shell authShell">
      <section className="authState" aria-live="polite">
        <p className="year">Hackweek Access</p>
        <h1>{title}</h1>
        <p className="lede">{detail}</p>
      </section>
    </main>
  );
}
