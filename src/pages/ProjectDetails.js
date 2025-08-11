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
import PageHeader from '../components/PageHeader';
import {customStyles} from '../components/SelectComponents';

function getVoteKey(uid, awardCategoryKey) {
  return `${uid}:${awardCategoryKey}`;
}

function Awards({awards, awardCategories}) {
  return awards && awards.length ? (
    <div className="Project-meta" key="awards">
      <span className="Project-meta-title">Awards</span>
      <ul className="Project-award-list">
        {awards.map((award) => (
          <li key={award.key}>
            <span className="glyphicon glyphicon-star" />{' '}
            {awardCategories.find((ac) => ac.key === award.awardCategory).name}
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
    onDelete: PropTypes.func,
    disabled: PropTypes.bool,
    voteList: PropTypes.object,
    auth: PropTypes.object,
    projectList: PropTypes.object,
    params: PropTypes.object,
  };

  constructor(props, ...args) {
    super(props, ...args);
    this.state = {
      userVote: props.userVote,
    };
  }

  findExistingVoteForCategory = (awardCategoryKey) => {
    const {voteList, auth, params} = this.props;
    const currentProjectKey = params.projectKey;

    if (!voteList || !auth) {
      return null;
    }

    const votesArray = Object.keys(voteList).map((key) => ({
      ...voteList[key],
      key,
    }));

    const existingVote = votesArray.find(
      (vote) =>
        vote.creator === auth.uid &&
        vote.awardCategory === awardCategoryKey &&
        vote.project !== currentProjectKey
    );

    return existingVote;
  };

  onChangeVote = (choice) => {
    let awardCategory = choice ? choice.value : null;
    let oldAwardCategory = this.state.userVote;

    if (awardCategory && awardCategory !== oldAwardCategory) {
      const existingVote = this.findExistingVoteForCategory(awardCategory);

      if (existingVote) {
        const {projectList, awardCategoryList} = this.props;
        const existingProject = projectList
          ? Object.values(projectList).find(
              (project) => project.key === existingVote.project
            )
          : null;
        const categoryName = awardCategoryList
          ? awardCategoryList.find((cat) => cat.key === awardCategory)?.name
          : 'Unknown Category';

        const projectName = existingProject?.name || 'Unknown Project';
        const confirmMessage = `You already gave "${projectName}" the "${categoryName}" category vote. Do you want to retract that vote and move it to this project?`;

        if (!window.confirm(confirmMessage)) {
          return;
        }
      }
    }

    this.setState({userVote: awardCategory}, () => {
      if (oldAwardCategory) {
        this.props.onDelete(oldAwardCategory);
      }

      if (awardCategory) {
        this.props.onSave(awardCategory);
      }
    });
  };

  onRemoveVote = () => {
    const currentVote = this.state.userVote;
    if (currentVote) {
      this.setState({userVote: null}, () => {
        this.props.onDelete(currentVote);
      });
    }
  };

  render() {
    let {awardCategoryList} = this.props;

    let awardCategoryOptions = mapObject(awardCategoryList)
      .sort((a, b) => ('' + a.name).localeCompare(b.name))
      .map((awardCategory) => ({
        value: awardCategory.key,
        label: awardCategory.name,
      }));

    let selectedOption = this.state.userVote
      ? awardCategoryOptions.find((option) => option.value === this.state.userVote)
      : null;

    return (
      <div className="Project-meta" key="awards">
        <dl>
          <dt>Vote</dt>
          <dd>
            <Select
              styles={customStyles}
              name="category"
              value={selectedOption}
              isMulti={false}
              options={awardCategoryOptions}
              disabled={this.props.disabled}
              onChange={this.onChangeVote}
              menuAnchor="right"
            />
            {this.state.userVote && (
              <button
                type="button"
                onClick={this.onRemoveVote}
                disabled={this.props.disabled}
                style={{
                  marginTop: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  color: '#dc3545',
                  backgroundColor: 'transparent',
                  border: '1px solid #dc3545',
                  borderRadius: '4px',
                  cursor: this.props.disabled ? 'not-allowed' : 'pointer',
                  opacity: this.props.disabled ? 0.6 : 1,
                }}
              >
                Remove vote
              </button>
            )}
          </dd>
        </dl>
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
    groupsList: PropTypes.object,
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

    if (this.isProjectMember()) {
      return; // no-op attempt to vote for your own project
    }

    // Enforce unique constraint by having key by combination of
    // user and award category
    let voteKey = getVoteKey(auth.uid, awardCategoryKey);

    firebase.ref(`years/${year}/votes/${voteKey}`).set({
      creator: auth.uid,
      project: projectKey,
      awardCategory: awardCategoryKey,
      ts: Date.now(),
    });
  };

  onDeleteUserVote = (awardCategoryKey) => {
    let {auth, firebase, params} = this.props;
    let year = params.year || currentYear;

    let voteKey = getVoteKey(auth.uid, awardCategoryKey);
    firebase.remove(`years/${year}/votes/${voteKey}`);
  };

  isProjectMember() {
    return (this.props.project.members || {}).hasOwnProperty(this.props.auth.uid);
  }
  render() {
    let {
      awardList,
      firebase,
      params,
      profile,
      project,
      groupsList,
      userList,
      year,
      voteList,
      projects,
    } = this.props;
    if (
      !isLoaded(project) ||
      !isLoaded(groupsList) ||
      !isLoaded(userList) ||
      !isLoaded(awardList) ||
      !isLoaded(profile) ||
      !isLoaded(year) ||
      !isLoaded(voteList) ||
      !isLoaded(projects)
    )
      return <div className="loading-indicator">Loading..</div>;
    if (project === null) return <Layout />;

    let projectMembers = Object.keys(project.members || {})
      .map((memberKey) => {
        return userList[memberKey];
      })
      .filter((member) => member !== null);

    let group = groupsList?.[project.group];

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

    let canEdit = profile.admin || this.isProjectMember() || !projectMembers.length;

    let creator = userList[project.creator] || null;

    let awards = mapObject(awardList).filter((award) => award.project === projectKey);

    return (
      <Layout>
        <div className="Project-Details">
          <div>
            <PageHeader
              title={project.name}
              canEdit={canEdit}
              onDelete={this.onDelete}
              editLink={`/years/${params.year || currentYear}/projects/${
                params.projectKey
              }/edit`}
            />
          </div>
          <div className="Project-Details-Content">
            <div className="Project-Details-Content-main">
              {project.videoUrl &&
                project.videoUrl.match(
                  /https:\/\/drive\.google\.com\/file\/d\/(.*)\/[a-z]*.*/
                )[1] && (
                  <iframe
                    src={`https://drive.google.com/file/d/${
                      project.videoUrl.match(
                        /https:\/\/drive\.google\.com\/file\/d\/(.*)\/[a-z]*.*/
                      )[1]
                    }/preview`}
                    allow="autoplay"
                    style={{width: '100%', aspectRatio: '16/9'}}
                  ></iframe>
                )}
              <h2>Summary</h2>
              <div
                className="Project-details-summary no-forced-lowercase"
                dangerouslySetInnerHTML={{
                  __html: marked(project.summary),
                }}
              />
              {project.repository && (
                <div className="Project-details-summary">
                  <h3>Repository</h3>
                  <div>{project.repository}</div>
                </div>
              )}
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
                  <h2>Team</h2>
                  {project.needHelp && (
                    <div className="alert alert-block alert-info">
                      {project.needHelpComments ? (
                        <blockquote>
                          <header>
                            <strong>This project is looking for help!</strong>
                          </header>
                          <span
                            className="no-forced-lowercase"
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
            <div className="Project-Details-Sidebar">
              <div className="Project-meta" key="meta">
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
                  <dt>Group</dt>
                  <dd>{group?.name}</dd>
                </dl>
              </div>
              {year.votingEnabled ? (
                <ProjectVote
                  key={this.state.userVote && this.state.userVote.awardCategory}
                  awardCategoryList={awardCategories}
                  userVote={
                    this.state.userVote ? this.state.userVote.awardCategory : null
                  }
                  disabled={this.isProjectMember()}
                  onSave={this.onSaveUserVote}
                  onDelete={this.onDeleteUserVote}
                  voteList={this.props.voteList}
                  auth={this.props.auth}
                  projectList={this.props.projects}
                  params={this.props.params}
                />
              ) : (
                <Awards awards={awards} awardCategories={awardCategories} />
              )}
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
      path: `/years/${props.params.year || currentYear}/awardCategories`,
      queryParams: ['orderByChild=name'],
      storeAs: 'awardCategoryList',
    },
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      storeAs: 'userList',
    },
    {
      path: `/years/${props.params.year || currentYear}/groups`,
      queryParams: ['orderByValue=name'],
      populates: [],
      storeAs: 'groupsList',
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
    {
      path: `/years/${props.params.year || currentYear}/votes`,
      populates: keyPopulates,
      storeAs: 'voteList',
    },
    {
      path: `/years/${props.params.year || currentYear}/projects`,
      populates: keyPopulates,
      storeAs: 'projects',
    },
  ]),
  connect(({firebase}) => {
    return {
      auth: pathToJS(firebase, 'auth'),
      profile: pathToJS(firebase, 'profile'),
      year: orderedPopulatedDataToJS(firebase, 'year'),
      awardList: orderedPopulatedDataToJS(firebase, 'awardList', keyPopulates),
      project: orderedPopulatedDataToJS(firebase, 'project'),
      groupsList: orderedPopulatedDataToJS(firebase, 'groupsList'),
      userList: orderedPopulatedDataToJS(firebase, 'userList'),
      awardCategoryList: orderedPopulatedDataToJS(firebase, 'awardCategoryList'),
      voteList: orderedPopulatedDataToJS(firebase, 'voteList', keyPopulates),
      projects: orderedPopulatedDataToJS(firebase, 'projects', keyPopulates),
    };
  })
)(ProjectDetails);
