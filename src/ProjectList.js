import React, {Component} from 'react';
import PropTypes from 'prop-types';
import './App.css';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, isEmpty, dataToJS} from 'react-redux-firebase';

class ProjectList extends Component {
  static propTypes = {
    projectList: PropTypes.object,
  };

  addProject = () => {
    const {newProject} = this.refs;
    return this.props.firebase
      .push('/projects', {name: newProject.value, done: false})
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
          <ul>
            {Object.keys(projectList).map(projectKey => {
              return <li key={projectKey}>{projectList[projectKey].name}</li>;
            })}
          </ul>
        )}
        <input type="text" ref="newProject" />
        <button onClick={this.addProject}>Add</button>
      </div>
    );
  }
}

export default compose(
  firebaseConnect(['projects']),
  connect(({firebase}) => ({
    projectList: dataToJS(firebase, 'projects'),
  }))
)(ProjectList);
