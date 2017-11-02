import React, {Component} from 'react';
import idx from 'idx';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import './ProjectList.css';

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

  onDelete = () => {
    let {firebase, params, project} = this.props;

    firebase.remove(`/years/${params.year}/projects/${project.key}`).then(() => {
      this.context.router.push('/');
    });
  };

  render() {
    let {auth, project} = this.props;
    if (!isLoaded(project)) return <div className="loading-indicator">Loading..</div>;

    return (
      <Layout>
        <div>
          {idx(project.creator, _ => _.key) === auth.uid && (
            <a
              onClick={this.onDelete}
              className="btn btn-sm btn-danger"
              style={{float: 'right'}}
            >
              Delete Project
            </a>
          )}
          <h2>{project && project.name}</h2>
        </div>
        <div>
          <h3>Summary</h3>
          <pre>{project.summary}</pre>
          <h3>Team</h3>
          <pre>TBD</pre>
        </div>
      </Layout>
    );
  }
}

const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect(props => [
    {
      path: `/years/${props.params.year}/projects/${props.params.projectKey}`,
      populates: projectPopulates,
      storeAs: 'project',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    project: orderedPopulatedDataToJS(firebase, 'project', projectPopulates),
  }))
)(ProjectDetails);
