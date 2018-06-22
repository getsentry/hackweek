import React from 'react';
import {IndexRedirect, Route} from 'react-router';

import App from './pages/App';
import EditProject from './pages/EditProject';
import Login from './pages/Login';
import NewProject from './pages/NewProject';
import ProjectList from './pages/ProjectList';
import ProjectDetails from './pages/ProjectDetails';
import YearList from './pages/YearList';

import {loginRequired} from './auth';

export default (
  <Route path="/" component={App}>
    <IndexRedirect to={`/projects`} />
    <Route path="/login" component={Login} />
    <Route path="/projects" component={loginRequired(ProjectList)} />
    <Route path="/new-project" component={loginRequired(NewProject)} />
    <Route path="/projects/:projectKey" component={loginRequired(ProjectDetails)} />
    <Route path="/years" component={loginRequired(YearList)} />
    <Route path="/years/:year/projects" component={loginRequired(ProjectList)} />
    <Route
      path="/years/:year/projects/:projectKey"
      component={loginRequired(ProjectDetails)}
    />
    <Route
      path="/years/:year/projects/:projectKey/edit"
      component={loginRequired(EditProject)}
    />
  </Route>
);
