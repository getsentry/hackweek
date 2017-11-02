import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import './ProjectList.css';

import {currentYear} from '../config';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import Layout from '../components/Layout';

class ProjectDetails extends Component {
  static propTypes = {
    auth: PropTypes.object,
    firebase: PropTypes.object,
    project: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object,
  };

  componentWillReceiveProps(nextProps) {
    if (nextProps.project === null) {
      this.context.router.push('/');
    }
  }

  onDelete = () => {
    let {firebase, params} = this.props;

    firebase.remove(`/years/${params.year || currentYear}/projects/${params.projectKey}`);
  };

  render() {
    let {auth, params, project} = this.props;
    if (!isLoaded(project)) return <div className="loading-indicator">Loading..</div>;
    if (project === null) return null;

    let projectMembers = project.members || {};

    return (
      <Layout>
        <div>
          {projectMembers.hasOwnProperty(auth.uid) && (
            <div className="btn-group" style={{float: 'right'}}>
              <Link
                to={`/years/${params.year ||
                  currentYear}/projects/${params.projectKey}/edit`}
                className="btn btn-sm btn-default"
              >
                Edit Project
              </Link>
              <a onClick={this.onDelete} className="btn btn-sm btn-danger">
                Delete Project
              </a>
            </div>
          )}
          <h2>{project.name}</h2>
        </div>
        <div>
          <h3>Summary</h3>
          <pre>{project.summary}</pre>
          <h3>Team</h3>
          <ul>
            {mapObject(projectMembers, (member, memberKey) => {
              return <li key={memberKey}>{memberKey}</li>;
            })}
          </ul>
        </div>
      </Layout>
    );
  }
}

const projectPopulates = [
  {child: 'creator', root: 'users', keyProp: 'key'},
  // {child: 'members', root: 'users', keyProp: 'key'},
];

export default compose(
  firebaseConnect(props => [
    {
      path: `/years/${props.params.year || currentYear}/projects/${props.params
        .projectKey}`,
      populates: projectPopulates,
      storeAs: 'project',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    project: orderedPopulatedDataToJS(firebase, 'project', projectPopulates),
  }))
)(ProjectDetails);
