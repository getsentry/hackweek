import {createStore, compose} from 'redux';
import rootReducer from './reducer';
import {firebase as fbConfig} from './config';
import {reactReduxFirebase} from 'react-redux-firebase';
import * as Sentry from '@sentry/react';

export default function configureStore(initialState, history) {
  const sentryReduxEnhancer = Sentry.createReduxEnhancer();

  const createStoreWithMiddleware = compose(
    reactReduxFirebase(fbConfig, {
      userProfile: 'users',
      enableLogging: false,
    }),
    typeof window === 'object' && typeof window.devToolsExtension !== 'undefined'
      ? window.devToolsExtension()
      : (f) => f,
    sentryReduxEnhancer
  )(createStore);

  const store = createStoreWithMiddleware(rootReducer);

  if (module.hot) {
    // Enable Webpack hot module replacement for reducers
    module.hot.accept('./reducer', () => {
      const nextRootReducer = require('./reducer');
      store.replaceReducer(nextRootReducer);
    });
  }

  return store;
}
