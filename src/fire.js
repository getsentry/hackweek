import firebase from 'firebase'

require('firebase/firestore');

var config = {
  apiKey: "AIzaSyB_YRRzzsbXEGfqbLriJY4sbGRrA6zwiTE",
  authDomain: "hackweek-34e1d.firebaseapp.com",
  databaseURL: "https://hackweek-34e1d.firebaseio.com",
  projectId: "hackweek-34e1d",
  storageBucket: "hackweek-34e1d.appspot.com",
  messagingSenderId: "694837489680"
};

var fire = firebase.initializeApp(config);

var db = firebase.firestore();

export {db};

export default fire;
