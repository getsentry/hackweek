import React from 'react';
import {IndexRoute, Route} from 'react-router';

import App from './pages/App';
import ProjectList from './pages/ProjectList';
import Login from './pages/Login';

export default (
  <Route path="/" component={App}>
    <IndexRoute component={ProjectList} />
    <Route path="/login" component={Login} />
  </Route>
);
