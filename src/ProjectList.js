import React, {Component} from 'react';
import PropTypes from 'prop-types';
import './App.css';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {
  firebaseConnect,
  isLoaded,
  isEmpty,
  dataToJS,
  pathToJS,
} from 'react-redux-firebase';

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
    auth: pathToJS(firebase, 'auth'),
    projectList: dataToJS(firebase, 'projects'),
  }))
)(ProjectList);
