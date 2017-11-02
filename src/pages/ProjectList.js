import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import './ProjectList.css';

import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import Layout from '../components/Layout';

class ProjectListItem extends Component {
  static propTypes = {
    auth: PropTypes.object,
    firebase: PropTypes.object,
    project: PropTypes.object,
  };

  render() {
    let {project} = this.props;
    return (
      <li className="list-group-item Project clearfix">
        <Link to={`/${project.year}/projects/${project.key}`}>
          <strong>{project.name}</strong>
        </Link>
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

  onAddProject = data => {
    let {auth, params} = this.props;

    return new Promise((resolve, reject) => {
      return this.props.firebase
        .push('/projects', {
          ...data,
          ts: new Date().getTime(),
          year: params.year,
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
          <h2>Projects</h2>
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
      path: `/years/${props.params.year}/projects`,
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
