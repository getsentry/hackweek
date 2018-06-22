import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import './ProjectList.css';

import {currentYear} from '../config';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import Layout from '../components/Layout';

class ProjectListItem extends Component {
  static propTypes = {
    awardList: PropTypes.project,
    auth: PropTypes.object,
    firebase: PropTypes.object,
    project: PropTypes.object,
    userList: PropTypes.object,
  };

  render() {
    let {awardList, project, userList} = this.props;
    let link = `/years/${project.year}/projects/${project.key}`;

    let projectMembers = Object.keys(project.members || {})
      .map(memberKey => {
        return userList[memberKey];
      })
      .filter(member => member !== null);

    let awards = mapObject(awardList).filter(award => award.project === project.key);

    return (
      <li className="list-group-item Project clearfix">
        {!!awards.length && (
          <div className="Project-award">
            <span role="img" title={awards.map(a => a.name).join(', ')}>
              🏆
            </span>
          </div>
        )}
        <Link to={link}>
          <strong>{project.name}</strong>
        </Link>
        {project.needHelp &&
          currentYear === project.year && <div className="badge">looking for help</div>}
        <div className="Project-member-list-condensed">
          {projectMembers.length ? (
            projectMembers.map(member => {
              return (
                <div className="Project-member" key={member.email}>
                  <img
                    src={member.avatarUrl}
                    className="Project-member-avatar"
                    alt="avatar"
                  />
                  <span className="Project-member-name">{member.displayName}</span>
                </div>
              );
            })
          ) : (
            <em>up for grabs</em>
          )}
        </div>
      </li>
    );
  }
}

class ProjectList extends Component {
  static propTypes = {
    auth: PropTypes.object,
    awardList: PropTypes.object,
    firebase: PropTypes.object,
    projectList: PropTypes.object,
    userList: PropTypes.object,
  };

  onAddProject = data => {
    let {auth, params} = this.props;

    return new Promise((resolve, reject) => {
      return this.props.firebase
        .push('/projects', {
          ...data,
          ts: new Date().getTime(),
          year: params.year || currentYear,
          creator: auth.uid,
        })
        .then(resolve)
        .catch(reject);
    });
  };

  renderBody() {
    let {auth, awardList, firebase, projectList, userList} = this.props;
    if (!isLoaded(projectList)) return <div className="loading-indicator">Loading..</div>;

    let projects = mapObject(projectList);
    let projectsLFH = [];
    let otherProjects = [];
    projects.forEach(p => {
      if (p.needHelp && currentYear === p.year) projectsLFH.push(p);
      else otherProjects.push(p);
    });

    if (!projects.length)
      return (
        <div className="alert alert-block alert-info">
          Oops! No projects have been created yet for this year!
        </div>
      );

    return (
      <div>
        {!!projectsLFH.length && (
          <div>
            <h3>Looking for Help</h3>
            <ul className="list-group Project-List">
              {projectsLFH.map(project => {
                return (
                  <ProjectListItem
                    key={project.key}
                    auth={auth}
                    firebase={firebase}
                    project={project}
                    awardList={awardList}
                    userList={userList}
                  />
                );
              })}
            </ul>
          </div>
        )}
        {!!otherProjects.length && (
          <div>
            {!!projectsLFH.length && <h3>Other Projects</h3>}
            <ul className="list-group Project-List">
              {otherProjects.map(project => {
                return (
                  <ProjectListItem
                    key={project.key}
                    auth={auth}
                    firebase={firebase}
                    project={project}
                    awardList={awardList}
                    userList={userList}
                  />
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  render() {
    return (
      <Layout>
        <div>
          {currentYear === (this.props.params.year || currentYear) && (
            <Link
              to="/new-project"
              className="btn btn-sm btn-primary"
              style={{float: 'right'}}
            >
              Add Project
            </Link>
          )}
          <h2>Projects for {this.props.params.year || currentYear}</h2>
        </div>
        {currentYear !== (this.props.params.year || currentYear) && (
          <div className="alert alert-block alert-info">
            You're viewing an archive of Hackweek projects for {this.props.params.year}{' '}
            &mdash; <Link to="/projects">Fast forward to {currentYear}</Link>
          </div>
        )}
        {this.renderBody()}
      </Layout>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];
const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect(props => [
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      populates: [],
      storeAs: 'userList',
    },
    {
      path: `/years/${props.params.year || currentYear}/awards`,
      queryParams: ['orderByChild=name'],
      populates: keyPopulates,
      storeAs: 'awardList',
    },
    {
      path: `/years/${props.params.year || currentYear}/projects`,
      queryParams: ['orderByChild=name'],
      populates: projectPopulates,
      storeAs: 'activeProjects',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    awardList: orderedPopulatedDataToJS(firebase, 'awardList', keyPopulates),
    projectList: orderedPopulatedDataToJS(firebase, 'activeProjects', projectPopulates),
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
  }))
)(ProjectList);
