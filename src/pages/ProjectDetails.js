import React, {Component} from 'react';
import moment from 'moment';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import marked from 'marked';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';

import './ProjectList.css';

import {currentYear} from '../config';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import Avatar from '../components/Avatar';
import Layout from '../components/Layout';
import MediaObject from '../components/MediaObject';

function Awards({awardList}) {
  return awardList && awardList.length ? (
    <div className="Project-meta" key="awards">
      <h3>Awards</h3>
      <ul className="Project-award-list">
        {awardList.map((award) => (
          <li key={award.key}>
            <span className="glyphicon glyphicon-star" /> {award.name}
          </li>
        ))}
      </ul>
    </div>
  ) : null;
}

class ProjectVote extends Component {
  static propTypes = {
    awardCategoryList: PropTypes.array,
    userVote: PropTypes.string,
    onSave: PropTypes.func,
  };

  constructor(props, ...args) {
    super(props, ...args);
    this.state = {
      userVote: props.userVote,
    };
  }

  onChangeVote = (choice) => {
    let awardCategory = choice.value;

    this.setState({userVote: awardCategory}, () => {
      this.props.onSave(awardCategory);
    });
  };
  render() {
    let {awardCategoryList} = this.props;

    let awardCategoryOptions = mapObject(awardCategoryList)
      .sort((a, b) => ('' + a.name).localeCompare(b.name))
      .map((awardCategory) => ({
        value: awardCategory.key,
        label: awardCategory.name,
      }));
    console.log(this.state.userVote);

    return (
      <div className="Project-meta" key="awards">
        <h3>Vote</h3>
        <div>
          <Select
            name="category"
            value={this.state.userVote}
            multi={false}
            options={awardCategoryOptions}
            onChange={this.onChangeVote}
          />
        </div>
      </div>
    );
  }
}

class ProjectDetails extends Component {
  static propTypes = {
    auth: PropTypes.object,
    awardList: PropTypes.object,
    year: PropTypes.object,
    firebase: PropTypes.object,
    profile: PropTypes.object,
    project: PropTypes.object,
    userList: PropTypes.object,
    awardCategoryList: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object,
  };

  constructor(props) {
    super(props);
    this.state = {
      userVote: null,
    };
  }
  componentDidUpdate(prevProps, prevState) {
    let {year, auth, params} = this.props;
    if (!isLoaded(year)) {
      return;
    }

    let userVote = Object.keys(year.votes || {})
      .map((voteKey) => ({
        ...year.votes[voteKey],
        key: voteKey,
      }))
      .filter((vote) => vote.creator === auth.uid && vote.project === params.projectKey);
    userVote = userVote.length ? userVote[0] : null;

    if (prevState.userVote === null && userVote !== null) {
      this.setState({userVote});
    }
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.project === null) {
      this.context.router.push('/');
    }
  }

  onDelete = () => {
    let {firebase, params} = this.props;

    firebase.remove(`/years/${params.year || currentYear}/projects/${params.projectKey}`);
  };

  onSaveUserVote = (awardCategoryKey) => {
    let {auth, firebase, params} = this.props;
    let year = params.year || currentYear;
    let {projectKey} = this.props.params;

    let vote = this.state.userVote;

    if (vote && vote.key) {
      firebase.update(`/years/${year}/votes/${vote.key}`, {
        project: projectKey,
        awardCategory: awardCategoryKey,
      });
    } else {
      firebase.push(`/years/${year}/votes`, {
        project: projectKey,
        awardCategory: awardCategoryKey,
        ts: Date.now(),
        creator: auth.uid,
      });
    }
  };
  render() {
    let {
      auth,
      awardList,
      firebase,
      params,
      profile,
      project,
      userList,
      year,
    } = this.props;
    if (
      !isLoaded(project) ||
      !isLoaded(userList) ||
      !isLoaded(awardList) ||
      !isLoaded(profile) ||
      !isLoaded(year)
    )
      return <div className="loading-indicator">Loading..</div>;
    if (project === null) return <Layout />;

    let projectMembers = Object.keys(project.members || {})
      .map((memberKey) => {
        return userList[memberKey];
      })
      .filter((member) => member !== null);

    projectMembers.sort((a, b) => ('' + a.displayName).localeCompare(b.displayName));
    // XXX(dcramer): not sure why this would happen
    if (!profile) profile = {};
    let media = Object.keys(project.media || {}).map((mediaKey) => ({
      ...project.media[mediaKey],
      key: mediaKey,
    }));

    let awardCategories = Object.keys(year.awardCategories || {}).map(
      (awardCategoryKey) => ({
        ...year.awardCategories[awardCategoryKey],
        key: awardCategoryKey,
      })
    );

    let projectKey = this.props.params.projectKey;

    let canEdit =
      profile.admin ||
      (project.members || {}).hasOwnProperty(auth.uid) ||
      !projectMembers.length;

    let creator = userList[project.creator] || null;

    let awards = mapObject(awardList).filter((award) => award.project === projectKey);
    console.log(this.state.userVote);
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
              {project.isIdea ? (
                <div
                  className="alert alert-block alert-info"
                  style={{textAlign: 'center'}}
                >
                  <p>
                    This project is was posted as an idea and is up for grabs. Interested?
                  </p>
                  <p>
                    <Link
                      to={`/years/${params.year || currentYear}/projects/${
                        params.projectKey
                      }/edit?claim`}
                      className="btn btn-xs btn-primary"
                    >
                      Claim this project
                    </Link>
                  </p>
                </div>
              ) : (
                <React.Fragment>
                  <h3>Team</h3>
                  {project.needHelp && (
                    <div className="alert alert-block alert-info">
                      {project.needHelpComments ? (
                        <blockquote>
                          <header>
                            <strong>This project is looking for help!</strong>
                          </header>
                          <span
                            dangerouslySetInnerHTML={{
                              __html: marked(project.needHelpComments),
                            }}
                          />
                        </blockquote>
                      ) : (
                        <p>
                          <strong>This project is looking for help!</strong> Reach out
                          someone on the team for more details.
                        </p>
                      )}
                    </div>
                  )}
                  {projectMembers.length ? (
                    <ul className="Project-member-list">
                      {projectMembers.map((member) => {
                        return (
                          <li key={member.email}>
                            <Avatar user={member} />
                            <a
                              href={`mailto:${member.displayName} <${member.email}>`}
                              className="Project-member-name"
                            >
                              {member.displayName} &lt;{member.email}&gt;
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p>
                      <em>up for grabs</em>
                    </p>
                  )}
                </React.Fragment>
              )}
              {!!media.length && (
                <div>
                  <h3>Media</h3>
                  <div className="Project-media">
                    {media.map((media) => (
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
              {year.votingEnabled ? (
                <ProjectVote
                  key={this.state.userVote && this.state.userVote.awardCategory}
                  awardCategoryList={awardCategories}
                  userVote={
                    this.state.userVote ? this.state.userVote.awardCategory : null
                  }
                  onSave={this.onSaveUserVote}
                />
              ) : (
                <Awards awards={awards} />
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
  firebaseConnect((props) => [
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
    {
      path: `/years/${props.params.year || currentYear}`,
      storeAs: 'year',
    },
  ]),
  connect(({firebase}) => {
    return {
      auth: pathToJS(firebase, 'auth'),
      profile: pathToJS(firebase, 'profile'),
      year: orderedPopulatedDataToJS(firebase, 'year'),
      awardList: orderedPopulatedDataToJS(firebase, 'awardList', keyPopulates),
      project: orderedPopulatedDataToJS(firebase, 'project'),
      userList: orderedPopulatedDataToJS(firebase, 'userList'),
      awardCategoryList: orderedPopulatedDataToJS(firebase, 'awardCategoryList'),
    };
  })
)(ProjectDetails);
