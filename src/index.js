import React from 'react';
import {Router, browserHistory} from 'react-router';
import {render} from 'react-dom';
import {Provider} from 'react-redux';

import configureStore from './store';

import routes from './routes';

import 'bootstrap/dist/css/bootstrap.css';
// import 'bootstrap/dist/css/bootstrap-theme.css';
import 'react-select/dist/react-select.css';

import './index.css';

const initialState = window.__INITIAL_STATE__ || {firebase: {authError: null}};
const store = configureStore(initialState);

render(
  <Provider store={store}>
    <Router history={browserHistory} routes={routes} />
  </Provider>,
  document.getElementById('root')
);
