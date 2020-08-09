import React from 'react';
import {IndexRedirect, IndexRoute, Route} from 'react-router';

import App from './pages/App';
import EditProject from './pages/EditProject';
import Login from './pages/Login';
import NewProject from './pages/NewProject';
import ProjectList from './pages/ProjectList';
import ProjectDetails from './pages/ProjectDetails';
import YearList from './pages/YearList';

import Admin from './pages/Admin';
import ManageAwardCategories from './pages/ManageAwardCategories';
import ManageAwards from './pages/ManageAwards';
import ManageVotes from './pages/ManageVotes';
import ManageYear from './pages/ManageYear';
import ManageYearDetails from './pages/ManageYearDetails';

import {loginRequired} from './auth';

export default (
  <Route path="/" component={App}>
    <IndexRedirect to={`/projects`} />
    <Route path="/login" component={Login} />
    <Route path="/projects" component={loginRequired(ProjectList)} />
    <Route path="/new-project" component={loginRequired(NewProject)} />
    <Route path="/projects/:projectKey" component={loginRequired(ProjectDetails)} />
    <Route
      path="/projects/:projectKey/:title"
      component={loginRequired(ProjectDetails)}
    />
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
    <Route
      path="/years/:year/projects/:projectKey/:title"
      component={loginRequired(ProjectDetails)}
    />
    <Route path="/admin" component={loginRequired(Admin)} />
    <Route path="/admin/years/:year" component={loginRequired(ManageYear)}>
      <IndexRoute component={loginRequired(ManageYearDetails)} />
      <Route
        path="/admin/years/:year/award-categories"
        component={loginRequired(ManageAwardCategories)}
      />
      <Route path="/admin/years/:year/votes" component={loginRequired(ManageVotes)} />
      <Route path="/admin/years/:year/awards" component={loginRequired(ManageAwards)} />
    </Route>
  </Route>
);
