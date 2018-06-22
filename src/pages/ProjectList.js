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
    auth: PropTypes.object,
    firebase: PropTypes.object,
    project: PropTypes.object,
    userList: PropTypes.object,
  };

  render() {
    let {project, userList} = this.props;
    let link = `/years/${project.year}/projects/${project.key}`;

    let projectMembers = Object.keys(project.members || {})
      .map(memberKey => {
        return userList[memberKey];
      })
      .filter(member => member !== null);

    return (
      <li className="list-group-item Project clearfix">
        <Link to={link}>
          <strong>{project.name}</strong>
        </Link>
        {project.needHelp && <div className="badge">looking for help</div>}
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
    let {auth, firebase, projectList, userList} = this.props;
    if (!isLoaded(projectList)) return <div className="loading-indicator">Loading..</div>;

    let projects = mapObject(projectList);
    let projectsLFH = [];
    let otherProjects = [];
    projects.forEach(p => {
      if (p.needHelp && currentYear === p.year) projectsLFH.push(p);
      else otherProjects.push(p);
    });

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
            <strong>
              You're viewing an archive of Hackweek projects for {this.props.params.year}
            </strong>
          </div>
        )}
        {this.renderBody()}
      </Layout>
    );
  }
}

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
      path: `/years/${props.params.year || currentYear}/projects`,
      queryParams: ['orderByChild=name'],
      populates: projectPopulates,
      storeAs: 'activeProjects',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
    projectList: orderedPopulatedDataToJS(firebase, 'activeProjects', projectPopulates),
  }))
)(ProjectList);
