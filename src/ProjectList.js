import React, {Component} from 'react';
import PropTypes from 'prop-types';
import './App.css';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, isEmpty, dataToJS} from 'react-redux-firebase';

class ProjectList extends Component {
  static propTypes = {
    projectList: PropTypes.arrayOf(PropTypes.object),
  };

  render() {
    let {projectList} = this.props;
    console.log(projectList);
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
