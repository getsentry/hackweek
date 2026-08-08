import {useState, type ReactNode} from 'react';
import {Link, useRoute} from 'wouter';

import type {SessionUser, SessionViewMode} from '../../shared/api';
import sentrySymbol from '../../assets/logos/logo-sentry-symbol.svg';

export function AppLayout({
  user,
  onViewModeChange,
  children,
}: {
  user: SessionUser;
  onViewModeChange: (mode: SessionViewMode) => Promise<void>;
  children: ReactNode;
}) {
  const [archivesActive] = useRoute('/years*');
  const [adminActive] = useRoute('/admin*');
  const [switchingViewMode, setSwitchingViewMode] = useState(false);
  const [viewModeError, setViewModeError] = useState<string | null>(null);

  async function switchViewMode() {
    setSwitchingViewMode(true);
    setViewModeError(null);
    try {
      await onViewModeChange(user.role === 'admin' ? 'member' : 'admin');
    } catch {
      setViewModeError('unable to switch view');
    } finally {
      setSwitchingViewMode(false);
    }
  }
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
          {user.actualRole === 'admin' && (
            <div className="viewModeSwitch">
              <span>viewing as {user.role === 'admin' ? 'admin' : 'user'}</span>
              <span aria-hidden="true">|</span>
              <button
                className="textButton"
                type="button"
                disabled={switchingViewMode}
                onClick={switchViewMode}
              >
                {user.role === 'admin' ? 'switch to user view' : 'back to admin'}
              </button>
              {viewModeError && <small role="status">{viewModeError}</small>}
            </div>
          )}
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
