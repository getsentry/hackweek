import type {ReactNode} from 'react';
import {Link, useRoute} from 'wouter';

import type {SessionUser} from '../../shared/api';

export function AppLayout({user, children}: {user: SessionUser; children: ReactNode}) {
  const [archivesActive] = useRoute('/years*');
  const [adminActive] = useRoute('/admin*');
  return (
    <div className="appFrame">
      <header className="masthead">
        <Link className="wordmark" href="/years" aria-label="Hackweek archives">
          <span>HW</span>
          <strong>Hackweek</strong>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/years" className={archivesActive ? 'active' : ''}>
            Archives
          </Link>
          {user.role === 'admin' && (
            <Link href="/admin/years/new" className={adminActive ? 'active' : ''}>
              Admin
            </Link>
          )}
        </nav>
        <div className="identity">
          <span>{user.displayName}</span>
          <small>{user.role}</small>
        </div>
      </header>
      {children}
      <footer className="siteFooter">
        <span>Sentry Hackweek</span>
        <span>Build the strange thing.</span>
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
      <p className="kicker">Signal report</p>
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
    return <PageState title="Tuning the signal" detail="Loading Hackweek records…" />;
  }
  if (error) {
    return (
      <PageState
        title="Signal interrupted"
        detail={error.message}
        tone={error.message.toLowerCase().includes('required') ? 'forbidden' : 'error'}
      />
    );
  }
  return children;
}
