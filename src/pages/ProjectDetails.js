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
import Avatar from '../components/Avatar';
import Layout from '../components/Layout';
import MediaObject from '../components/MediaObject';

class ProjectDetails extends Component {
  static propTypes = {
    auth: PropTypes.object,
    awardList: PropTypes.object,
    firebase: PropTypes.object,
    profile: PropTypes.object,
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
    let {auth, awardList, firebase, params, profile, project, userList} = this.props;
    if (
      !isLoaded(project) ||
      !isLoaded(userList) ||
      !isLoaded(awardList) ||
      !isLoaded(profile)
    )
      return <div className="loading-indicator">Loading..</div>;
    if (project === null) return <Layout />;
    let projectMembers = Object.keys(project.members || {})
      .map(memberKey => {
        return userList[memberKey];
      })
      .filter(member => member !== null);

    // XXX(dcramer): not sure why this would happen
    if (!profile) profile = {};
    let media = Object.keys(project.media || {}).map(mediaKey => ({
      ...project.media[mediaKey],
      key: mediaKey,
    }));

    let projectKey = this.props.params.projectKey;

    let canEdit =
      profile.admin ||
      (project.members || {}).hasOwnProperty(auth.uid) ||
      !projectMembers.length;

    let creator = userList[project.creator] || null;

    let awards = mapObject(awardList).filter(award => award.project === projectKey);

    return (
      <Layout>
        <div className="Project-Details">
          <div>
            {canEdit && (
              <div className="btn-set" style={{float: 'right'}}>
                <Link
                  to={`/years/${params.year || currentYear}/projects/${
                    params.projectKey
                  }/edit`}
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
              {project.needHelp && (
                <div className="alert alert-block alert-info">
                  This project is looking for help! Reach out someone on the team for more
                  details.
                </div>
              )}
              {projectMembers.length ? (
                <ul className="Project-member-list">
                  {projectMembers.map(member => {
                    return (
                      <li key={member.email}>
                        <Avatar user={member} />
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
              {!!media.length && (
                <div>
                  <h3>Media</h3>
                  <div className="Project-media">
                    {media.map(media => (
                      <MediaObject
                        key={media.key}
                        firebase={firebase}
                        media={media}
                        project={project}
                        projectKey={params.projectKey}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="col-md-3 col-md-offset-1">
              {!!awards.length && (
                <div className="Project-meta" key="awards">
                  <h3>Awards</h3>
                  <ul className="Project-award-list">
                    {awards.map(award => (
                      <li key={award.key}>
                        <span className="glyphicon glyphicon-star" /> {award.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="Project-meta" key="meta">
                <h3>Meta</h3>
                <dl>
                  {creator && [
                    <dt key="dt-creator">Created By</dt>,
                    <dd key="dd-creator">
                      <Avatar user={creator} />
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

const keyPopulates = [{keyProp: 'key'}];

export default compose(
  firebaseConnect(props => [
    {
      path: `/years/${props.params.year || currentYear}/awards`,
      queryParams: ['orderByChild=name'],
      storeAs: 'awardList',
      populates: keyPopulates,
    },
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      storeAs: 'userList',
    },
    {
      path: `/years/${props.params.year || currentYear}/projects/${
        props.params.projectKey
      }`,
      storeAs: 'project',
      keyProp: 'key',
    },
  ]),
  connect(({firebase}) => {
    return {
      auth: pathToJS(firebase, 'auth'),
      profile: pathToJS(firebase, 'profile'),
      awardList: orderedPopulatedDataToJS(firebase, 'awardList', keyPopulates),
      project: orderedPopulatedDataToJS(firebase, 'project'),
      userList: orderedPopulatedDataToJS(firebase, 'userList'),
    };
  })
)(ProjectDetails);
