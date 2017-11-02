import React from 'react';
import {IndexRedirect, Route} from 'react-router';

import App from './pages/App';
import EditProject from './pages/EditProject';
import Login from './pages/Login';
import NewProject from './pages/NewProject';
import ProjectList from './pages/ProjectList';
import ProjectDetails from './pages/ProjectDetails';

export default (
  <Route path="/" component={App}>
    <IndexRedirect to={`/projects`} />
    <Route path="/new-project" component={NewProject} />
    <Route path="/login" component={Login} />
    <Route path="/projects" component={ProjectList} />
    <Route path="/projects/:projectKey" component={ProjectDetails} />
    <Route path="/years/:year/projects" component={ProjectList} />
    <Route path="/years/:year/projects/:projectKey" component={ProjectDetails} />
    <Route path="/years/:year/projects/:projectKey/edit" component={EditProject} />
  </Route>
);
