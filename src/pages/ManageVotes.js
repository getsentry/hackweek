import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS, dataToJS} from 'react-redux-firebase';

import {mapObject, orderedPopulatedDataToJS} from '../helpers';

class ManageAwardCategories extends Component {
  static propTypes = {
    auth: PropTypes.object,
    awardCategories: PropTypes.object,
    projects: PropTypes.object,
    voteList: PropTypes.object,
    firebase: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {};
  }

  render() {
    let {awardCategories, voteList, projects, auth} = this.props;
    if (
      !isLoaded(auth) ||
      !isLoaded(awardCategories) ||
      !isLoaded(voteList) ||
      !isLoaded(projects)
    )
      return <div className="loading-indocator">Loading...</div>;

    voteList = mapObject(voteList);
    let votesByProjectAndCategory = {};
    voteList.forEach((v) => {
      let projectKey = v.project;
      let categoryKey = v.awardCategory;
      votesByProjectAndCategory[categoryKey] =
        votesByProjectAndCategory[categoryKey] || {};
      let votesByProject = votesByProjectAndCategory[categoryKey];
      votesByProject[projectKey] = (votesByProject[projectKey] || 0) + 1;
    });

    return (
      <div>
        {Object.keys(votesByProjectAndCategory).map((categoryKey) => {
          let votesByProject = votesByProjectAndCategory[categoryKey];

          return (
            <div key={categoryKey}>
              <h3>{awardCategories[categoryKey].name}</h3>
              <ul>
                {Object.keys(votesByProject)
                  .sort((a, b) => {
                    return votesByProject[a] < votesByProject[b]
                      ? 1
                      : votesByProject[a] > votesByProject[b]
                      ? -1
                      : 0;
                  })
                  .map((projectKey) => {
                    let project = projects[projectKey];
                    return (
                      <li key={projectKey}>
                        {project.name} • {votesByProject[projectKey]}
                      </li>
                    );
                  })}
              </ul>
            </div>
          );
        })}
      </div>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];
const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect(({params}) => [
    {
      path: `/years/${params.year}/awardCategories`,
      populates: keyPopulates,
      storeAs: 'awardCategories',
    },
    {
      path: `/years/${params.year}/projects`,
      populates: projectPopulates,
      storeAs: 'projects',
    },
    {path: `/years/${params.year}/votes`, populates: keyPopulates, storeAs: 'voteList'},
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    awardCategories: dataToJS(firebase, 'awardCategories'),
    projects: dataToJS(firebase, 'projects'),
    voteList: orderedPopulatedDataToJS(firebase, 'voteList', keyPopulates),
  }))
)(ManageAwardCategories);
