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
          <ul className="list-group">
            {Object.keys(projectList).map(projectKey => {
              return (
                <li className="list-group-item" key={projectKey}>
                  {projectList[projectKey].name}
                </li>
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

export default compose(
  firebaseConnect(['projects']),
  connect(({firebase}) => ({
    projectList: dataToJS(firebase, 'projects'),
  }))
)(ProjectList);
