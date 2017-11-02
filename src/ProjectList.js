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

  addProject = e => {
    e.preventDefault();

    let {newProject} = this.refs;
    let {auth} = this.props;

    return this.props.firebase
      .push('/projects', {
        name: newProject.value,
        creator: auth.uid,
        done: false,
      })
      .then(() => {
        newProject.name = 'untitled';
      });
  };

  render() {
    let {projectList} = this.props;
    return (
      <div>
        <h3>Projects</h3>
        {!isLoaded(projectList) ? (
          'Loading'
        ) : isEmpty(projectList) ? (
          'No projects'
        ) : (
          <ul className="list-group">
            {Object.keys(projectList).map(projectKey => {
              return (
                <ProjectListItem key={projectKey} project={projectList[projectKey]} />
              );
            })}
          </ul>
        )}
        <form onSubmit={this.addProject}>
          <input type="text" ref="newProject" />
          <button>Add</button>
        </form>
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
