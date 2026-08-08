import type {ReactNode} from 'react';
import {Link, useRoute} from 'wouter';

import type {SessionUser} from '../../shared/api';
import sentrySymbol from '../../assets/logos/logo-sentry-symbol.svg';

export function AppLayout({user, children}: {user: SessionUser; children: ReactNode}) {
  const [archivesActive] = useRoute('/years*');
  const [adminActive] = useRoute('/admin*');
  return (
    <div className="appFrame">
      <header className="masthead app-header">
        <Link
          className="wordmark hackweek-wordmark"
          href="/years"
          aria-label="Sentry Hackweek archives"
        >
          <img src={sentrySymbol} alt="" />
          <strong>#HACKWEEK</strong>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/years" className={archivesActive ? 'active' : ''}>
            hackweek
          </Link>
          {user.role === 'admin' && (
            <Link href="/admin/years/new" className={adminActive ? 'active' : ''}>
              admin
            </Link>
          )}
        </nav>
        <div className="identityActions">
          <div
            className="identity"
            aria-label={`signed in as ${user.displayName}, ${user.role}`}
          >
            <span>{user.displayName}</span>
            <small>{user.role}</small>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="textButton" type="submit">
              sign out
            </button>
          </form>
        </div>
      </header>
      {children}
      <footer className="siteFooter">
        <Link className="footerWordmark" href="/years">
          <img src={sentrySymbol} alt="" />
          <span>#HACKWEEK</span>
        </Link>
        <span>made at Sentry</span>
      </footer>
    </div>
  );
}

export function PageState({
  title,
  detail,
  tone = 'neutral',
}: {
  title: string;
  detail: string;
  tone?: 'neutral' | 'error' | 'forbidden';
}) {
  return (
    <section className={`pageState pageState--${tone}`} aria-live="polite">
      <p className="kicker">Hackweek</p>
      <h1>{title}</h1>
      <p>{detail}</p>
      {tone === 'forbidden' && <Link href="/years">Return to archives</Link>}
    </section>
  );
}

export function QueryState({
  error,
  loading,
  children,
}: {
  error: Error | null;
  loading: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return <PageState title="Loading Hackweek" detail="Loading Hackweek records…" />;
  }
  if (error) {
    return (
      <PageState
        title="Something went wrong"
        detail={error.message}
        tone={error.message.toLowerCase().includes('required') ? 'forbidden' : 'error'}
      />
    );
  }
  return children;
}
