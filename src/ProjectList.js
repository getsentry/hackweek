import React, {Component} from 'react';
import PropTypes from 'prop-types';
import './ProjectList.css';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {
  firebaseConnect,
  isLoaded,
  isEmpty,
  populatedDataToJS,
  pathToJS,
} from 'react-redux-firebase';

import {currentYear} from './config';

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
          <input class="form-control" type="text" ref="name" required />
        </div>
        <div className="form-group">
          <label>Summary</label>
          <textarea class="form-control" ref="summary" required />
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
            <img src={project.creator.avatarUrl} className="Project-creator-avatar" />
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
          year: currentYear,
          creator: auth.uid,
        })
        .then(resolve)
        .catch(reject);
    });
  };

  render() {
    let {projectList} = this.props;
    return (
      <div>
        <h1 style={{textAlign: 'center'}}>Projects</h1>
        {!isLoaded(projectList) ? (
          'Loading'
        ) : isEmpty(projectList) ? (
          'No projects'
        ) : (
          <ul className="list-group Project-List">
            {Object.keys(projectList).map(projectKey => {
              return (
                <ProjectListItem key={projectKey} project={projectList[projectKey]} />
              );
            })}
          </ul>
        )}
        <NewProjectForm onSubmit={this.onAddProject} />
      </div>
    );
  }
}

const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect([{path: 'projects', populates: projectPopulates}]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    projectList: populatedDataToJS(firebase, 'projects', projectPopulates),
  }))
)(ProjectList);
