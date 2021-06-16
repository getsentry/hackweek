import React from 'react';
import * as Router from 'react-router';
import {render} from 'react-dom';
import {Provider} from 'react-redux';

import configureStore from './store';

import routes from './routes';

import 'bootstrap/dist/css/bootstrap.css';
// import 'bootstrap/dist/css/bootstrap-theme.css';
import 'react-select/dist/react-select.css';

import './index.css';

import * as Sentry from '@sentry/react';
import {Integrations as TracingIntegrations} from '@sentry/tracing';

import {version} from './config';

Sentry.init({
  dsn: window.SENTRY_DSN,
  allowUrls: [/hackweek\.getsentry\.net/],
  integrations: [
    new TracingIntegrations.BrowserTracing({
      routingInstrumentation: Sentry.reactRouterV3Instrumentation(
        Router.browserHistory,
        Router.createRoutes(routes),
        Router.match
      ),
    }),
  ],
  release: `hackweek@${version}`,
  tracesSampleRate: 1,
  autoSessionTracking: true,
});

const initialState = window.__INITIAL_STATE__ || {firebase: {authError: null}};
const store = configureStore(initialState);

render(
  <Provider store={store}>
    <Router.Router history={Router.browserHistory} routes={routes} />
  </Provider>,
  document.getElementById('root')
);
