import React from 'react';
import {IndexRoute, Route} from 'react-router';

import App from './pages/App';
import NewProject from './pages/NewProject';
import ProjectList from './pages/ProjectList';
import Login from './pages/Login';

export default (
  <Route path="/" component={App}>
    <IndexRoute component={ProjectList} />
    <Route path="/new-project" component={NewProject} />
    <Route path="/login" component={Login} />
  </Route>
);
