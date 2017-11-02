import React, {Component} from 'react';
import PropTypes from 'prop-types';
import './ProjectList.css';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, isEmpty, pathToJS} from 'react-redux-firebase';

import {currentYear} from '../config';
import {orderedPopulatedDataToJS} from '../helpers';
import Layout from '../components/Layout';

class NewProjectForm extends Component {
  onSubmit = e => {
    e.preventDefault();

    this.props
      .onSubmit({
        name: this.refs.name.value,
        summary: this.refs.summary.value,
      })
      .then(() => {
        this.refs.name.value = '';
        this.refs.summary.value = '';
      });
  };

  render() {
    return (
      <form onSubmit={this.onSubmit} className="form New-Project-Form">
        <h3>Add a New Project</h3>
        <div className="form-group">
          <label>Project Name</label>
          <input className="form-control" type="text" ref="name" required />
        </div>
        <div className="form-group">
          <label>Summary</label>
          <textarea className="form-control" ref="summary" required />
        </div>
        <button className="btn btn-primary">Add</button>
      </form>
    );
  }
}

class ProjectListItem extends Component {
  static propTypes = {
    project: PropTypes.object,
  };

  render() {
    let {project} = this.props;
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
      </li>
    );
  }
}

class ProjectList extends Component {
  static propTypes = {
    auth: PropTypes.object,
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

  mapObject(obj, callback) {
    let results = [];
    let key;
    for (key in obj) {
      results.push(callback(key, obj));
    }
    return results;
  }

  render() {
    // Object.keys does not retain order
    let {projectList} = this.props;
    return (
      <Layout>
        <h1 style={{textAlign: 'center'}}>Projects</h1>
        {!isLoaded(projectList) ? (
          'Loading'
        ) : isEmpty(projectList) ? (
          'No projects'
        ) : (
          <ul className="list-group Project-List">
            {this.mapObject(projectList, (projectKey, project) => {
              return (
                <ProjectListItem key={projectKey} project={projectList[projectKey]} />
              );
            })}
          </ul>
        )}
        <NewProjectForm onSubmit={this.onAddProject} />
      </Layout>
    );
  }
}

const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect([
    {
      path: 'projects',
      queryParams: ['orderByKey'],
      populates: projectPopulates,
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    projectList: orderedPopulatedDataToJS(firebase, 'projects', projectPopulates),
  }))
)(ProjectList);
