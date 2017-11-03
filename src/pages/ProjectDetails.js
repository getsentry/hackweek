import React, {Component} from 'react';
import moment from 'moment';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import marked from 'marked';
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
    userList: PropTypes.object,
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
    let {auth, params, project, userList} = this.props;
    if (!isLoaded(project) || !isLoaded(userList))
      return <div className="loading-indicator">Loading..</div>;
    if (project === null) return <Layout />;

    let projectMembers = Object.keys(project.members || {})
      .map(memberKey => {
        return userList[memberKey];
      })
      .filter(member => member !== null);

    let canEdit =
      (project.members || {}).hasOwnProperty(auth.uid) || !projectMembers.length;

    let creator = userList[project.creator] || null;

    return (
      <Layout>
        <div className="Project-Details">
          <div>
            {canEdit && (
              <div className="btn-set" style={{float: 'right'}}>
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
          <div className="row">
            <div className="col-md-8">
              <h3>Summary</h3>
              <div
                className="Project-summary"
                dangerouslySetInnerHTML={{
                  __html: marked(project.summary),
                }}
              />
              <h3>Team</h3>
              {projectMembers.length ? (
                <ul className="Project-member-list">
                  {projectMembers.map(member => {
                    return (
                      <li key={member.email}>
                        <img
                          src={member.avatarUrl}
                          className="Project-member-avatar"
                          alt="avatar"
                        />
                        <span className="Project-member-name">{member.displayName}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>
                  <em>up for grabs</em>
                </p>
              )}
            </div>
            <div className="col-md-3 col-md-offset-1">
              <div className="Project-meta">
                <h3>Meta</h3>
                <dl>
                  {creator && [
                    <dt key="dt-creator">Created By</dt>,
                    <dd key="dd-creator">
                      <img
                        src={creator.avatarUrl}
                        className="Project-member-avatar"
                        alt="avatar"
                      />
                      <span className="Project-member-name">{creator.displayName}</span>
                    </dd>,
                  ]}
                  <dt>Created On</dt>
                  <dd>{moment(project.ts).format('ll')}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
}

export default compose(
  firebaseConnect(props => [
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      storeAs: 'userList',
    },
    {
      path: `/years/${props.params.year || currentYear}/projects/${props.params
        .projectKey}`,
      storeAs: 'project',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    project: orderedPopulatedDataToJS(firebase, 'project'),
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
  }))
)(ProjectDetails);
