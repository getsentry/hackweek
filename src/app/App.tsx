import {Redirect, Route, Switch} from 'wouter';

import {AppLayout, PageState} from './components/AppLayout';
import {AdminAnalyticsPage} from './routes/AdminAnalyticsPage';
import {AdminPage} from './routes/AdminPage';
import {EditProjectPage, NewProjectPage} from './routes/ProjectEditorPage';
import {ProjectDetailsPage} from './routes/ProjectDetailsPage';
import {ProjectsPage} from './routes/ProjectsPage';
import {VotingPage} from './routes/VotingPage';
import {YearAdministrationPage} from './routes/YearAdministrationPage';
import {YearsPage} from './routes/YearsPage';
import {useSession} from './session';

export function App() {
  const session = useSession();

  if (session.status === 'loading') {
    return <AuthState title="Loading Hackweek" detail="checking your Sentry account…" />;
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
        title="Hackweek unavailable"
        detail="The identity service could not be reached."
      />
    );
  }

  return (
    <AppLayout user={session.user}>
      <Switch>
        <Route path="/years" component={YearsPage} />
        <Route path="/admin/analytics">
          {session.user.role === 'admin' ? (
            <AdminAnalyticsPage />
          ) : (
            <Redirect to="/years" />
          )}
        </Route>
        <Route path="/admin/years/new">
          {session.user.role === 'admin' ? (
            <YearAdministrationPage />
          ) : (
            <Redirect to="/years" />
          )}
        </Route>
        <Route path="/admin/years/:yearId">
          {session.user.role === 'admin' ? <AdminPage /> : <Redirect to="/years" />}
        </Route>
        <Route path="/years/:yearId/vote" component={VotingPage} />
        <Route path="/years/:yearId/projects/new" component={NewProjectPage} />
        <Route
          path="/years/:yearId/projects/:projectId/edit"
          component={EditProjectPage}
        />
        <Route path="/years/:yearId/projects/:projectId" component={ProjectDetailsPage} />
        <Route path="/years/:yearId/projects">
          <ProjectsPage isAdmin={session.user.role === 'admin'} />
        </Route>
        <Route path="/">
          <Redirect to="/years" />
        </Route>
        <Route>
          <PageState
            title="Lost in the archive"
            detail="That route does not exist."
            tone="error"
          />
        </Route>
      </Switch>
    </AppLayout>
  );
}

function AuthState({title, detail}: {title: string; detail: string}) {
  return (
    <main className="authShell">
      <section className="authState" aria-live="polite">
        <p className="kicker">Hackweek Access</p>
        <h1>{title}</h1>
        <p>{detail}</p>
      </section>
    </main>
  );
}
