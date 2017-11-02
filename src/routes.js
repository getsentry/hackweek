import React from 'react';
import {IndexRedirect, Route} from 'react-router';

import App from './pages/App';
import NewProject from './pages/NewProject';
import ProjectList from './pages/ProjectList';
import ProjectDetails from './pages/ProjectDetails';
import Login from './pages/Login';

import {currentYear} from './config';

export default (
  <Route path="/" component={App}>
    <IndexRedirect to={`/${currentYear}/projects`} />
    <Route path="/new-project" component={NewProject} />
    <Route path="/login" component={Login} />
    <Route path="/:year/projects" component={ProjectList} />
    <Route path="/:year/projects/:projectKey" component={ProjectDetails} />
  </Route>
);
