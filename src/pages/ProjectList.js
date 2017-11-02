import React, {Component} from 'react';
import {Link} from 'react-router';
import idx from 'idx';
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
  };

  onDelete = () => {
    let {firebase, project} = this.props;

    firebase.remove(`/years/${currentYear}/projects/${project.key}`);
  };

  render() {
    let {auth, project} = this.props;
    return (
      <li className="list-group-item Project clearfix">
        <strong>{project.name}</strong>
        {project.creator && (
          <div className="Project-creator">
            <img
              src={project.creator.avatarUrl}
              className="Project-creator-avatar"
              alt="avatar"
            />
            <span className="Project-creator-name">{project.creator.displayName}</span>
          </div>
        )}
        {idx(project.creator, _ => _.key) === auth.uid && (
          <a className="btn btn-xs btn-danger" onClick={this.onDelete}>
            Delete
          </a>
        )}
      </li>
    );
  }
}

class ProjectList extends Component {
  static propTypes = {
    auth: PropTypes.object,
    firebase: PropTypes.object,
    projectList: PropTypes.object,
  };

  onAddProject = params => {
    let {auth} = this.props;

    return new Promise((resolve, reject) => {
      return this.props.firebase
        .push('/projects', {
          ...params,
          ts: new Date().getTime(),
          year: currentYear,
          creator: auth.uid,
        })
        .then(resolve)
        .catch(reject);
    });
  };

  renderBody() {
    let {auth, firebase, projectList} = this.props;
    if (!isLoaded(projectList)) return <div className="loading-indicator">Loading..</div>;

    return (
      <div>
        <ul className="list-group Project-List">
          {mapObject(projectList, project => {
            return (
              <ProjectListItem
                key={project.key}
                auth={auth}
                firebase={firebase}
                project={project}
              />
            );
          })}
        </ul>
      </div>
    );
  }

  render() {
    return (
      <Layout>
        <div>
          <Link
            to="/new-project"
            className="btn btn-sm btn-default"
            style={{float: 'right'}}
          >
            Add Project
          </Link>
          <h1>Projects</h1>
        </div>
        {this.renderBody()}
      </Layout>
    );
  }
}

const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect(props => [
    {
      path: `/years/${currentYear}/projects`,
      queryParams: ['orderByKey'],
      populates: projectPopulates,
      storeAs: 'activeProjects',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    projectList: orderedPopulatedDataToJS(firebase, 'activeProjects', projectPopulates),
  }))
)(ProjectList);
