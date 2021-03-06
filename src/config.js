const isProd =
  (process.env.REACT_APP_ENVIRONMENT || process.env.NODE_ENV) === 'production';

const {version} = isProd ? require('./version.json') : 'dev';

const getFirebaseConfig = () => {
  const projectId = isProd ? 'hackweek-34e1d' : 'hackweek-34e1d-dev';
  const apiKey = isProd
    ? 'AIzaSyB_YRRzzsbXEGfqbLriJY4sbGRrA6zwiTE'
    : 'AIzaSyB35_7YQ2jc38Kze33OjgsPFPZ1kf-GhF4';
  return {
    apiKey: apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    databaseURL: `https://${projectId}.firebaseio.com`,
    projectId: projectId,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: '694837489680',
  };
};

export const firebase = getFirebaseConfig();

export const currentYear = new Date().getFullYear() + '';

export {version};

export default {firebase};
