import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import summarize from 'summarize-markdown';

import './ProjectList.css';

import {currentYear} from '../config';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import Avatar from '../components/Avatar';
import Layout from '../components/Layout';
import {slugify} from '../utils';
import Select from 'react-select';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';

function getAuthUserVotes(uid, voteList) {
  return Object.values(voteList || {}).filter((vote) => vote.creator === uid);
}

function getAwardCategories(awardCategoryList) {
  if (!awardCategoryList) return {};
  let result = {};
  Object.keys(awardCategoryList).forEach(
    (categoryKey) =>
      (result[categoryKey] = {
        ...awardCategoryList[categoryKey],
        key: categoryKey,
      })
  );
  return result;
}

class ProjectListItem extends Component {
  static propTypes = {
    awardCategoryOptions: PropTypes.object,
    awardList: PropTypes.object,
    auth: PropTypes.object,
    firebase: PropTypes.object,
    project: PropTypes.object,
    userList: PropTypes.object,
    group: PropTypes.object,
    submissionsClosed: PropTypes.bool,
    isOlderYear: PropTypes.bool,
  };

  render() {
    let {
      awardList,
      awardCategoryOptions,
      submissionsClosed,
      project,
      userList,
      group,
      isOlderYear,
    } = this.props;
    let link =
      currentYear === project.year
        ? `/projects/${project.key}/${slugify(project.name)}`
        : `/years/${project.year}/projects/${project.key}/${slugify(project.name)}`;

    let projectMembers = userList
      ? Object.keys(project.members || {})
          .map((memberKey) => userList[memberKey])
          .filter((member) => member != null)
      : [];
    projectMembers.sort((a, b) => ('' + a.displayName).localeCompare(b.displayName));

    // hide project if its not executed on
    if (submissionsClosed && project.isIdea) return null;

    let awards = mapObject(awardList)
      .filter((award) => award.project === project.key)
      .map((award) => ({
        ...award,
        name: Object.values(awardCategoryOptions).find(
          (aco) => aco.key === award.awardCategory
        )?.name,
      }));

    return (
      <li className="item-list Project">
        <div className="Project-row">
          {/* Left: Name and summary/members */}
          <div className="Project-main">
            {/* Project Name */}
            {project.needHelp && !submissionsClosed && (
              <div className="badge">looking for help</div>
            )}
            {group.id && (
              <div className={`Project-group-badge ${group.id}`}>{group.name}</div>
            )}
            <Link to={link}>
              <h3 className="no-forced-lowercase">{project.name}</h3>
            </Link>
            {/* Project Summary or Members/Badges */}
            <p className="Project-idea-summary no-forced-lowercase">
              {summarize(project.summary)}
            </p>

            <div className="Project-member-list-condensed">
              {projectMembers.length > 0 &&
                projectMembers.map((member) => (
                  <div className="Project-member" key={member.email}>
                    <Avatar user={member} />
                    <span className="Project-member-name">{member.displayName}</span>
                  </div>
                ))}
            </div>
          </div>
          {/* Right: Claim button and awards */}
          <div className="Project-actions">
            {(project.isIdea || projectMembers.length === 0) &&
              !submissionsClosed &&
              !isOlderYear && (
                <div className="Project-idea-claim">
                  <Link
                    to={`/years/${project.year}/projects/${project.key}/edit?claim`}
                    className="btn-set-btn"
                  >
                    <Button priority="secondary" size="xs">
                      Claim Project
                    </Button>
                  </Link>
                </div>
              )}
            {!!awards.length && (
              <div className="Project-award">
                {awards.map((a) => a.name).join(', ')}{' '}
                <span
                  className="glyphicon glyphicon-star"
                  title={awards.map((a) => a.name).join(', ')}
                />
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }
}

class ProjectList extends Component {
  static propTypes = {
    auth: PropTypes.object,
    year: PropTypes.object,
    awardCategoryList: PropTypes.object,
    awardList: PropTypes.object,
    groupsList: PropTypes.object,
    firebase: PropTypes.object,
    projectList: PropTypes.object,
    userList: PropTypes.object,
  };

  constructor(...args) {
    super(...args);
    this.state = {};
  }

  renderClosedYear() {
    let {
      auth,
      awardCategoryList,
      awardList,
      firebase,
      projectList,
      userList,
      groupsList,
    } = this.props;
    if (!groupsList) {
      groupsList = {};
    }
    let projects = mapObject(projectList);
    let winningProjects = [];
    let otherProjects = [];
    projects.forEach((p) => {
      if (mapObject(awardList).find((award) => award.project === p.key)) {
        winningProjects.push(p);
      } else {
        otherProjects.push(p);
      }
    });

    let awardCategoryOptions = getAwardCategories(awardCategoryList);

    if (this.state.groupFilter) {
      if (this.state.groupFilter.value === '') {
        projects = projects.filter((project) => !project.group);
      } else {
        projects = projects.filter(
          (project) => project.group === this.state.groupFilter.value
        );
      }
    }

    // Filter logic for closed years
    const showParam = this.props.location.query.show;
    const showIdeas = !showParam || showParam === 'ideas';
    const showProjects = showParam === 'projects';

    // Separate projects and ideas for filtering
    let projectIdeas = [];
    let actualProjects = [];
    projects.forEach((p) => {
      if (p.isIdea) projectIdeas.push(p);
      else actualProjects.push(p);
    });

    return (
      <div className="Project-list-container">
        {showIdeas && projectIdeas.length > 0 && (
          <div className="Project-list-section">
            <ul className="Project-List Project">
              {projectIdeas.map((project) => {
                return (
                  <ProjectListItem
                    key={project.key}
                    auth={auth}
                    firebase={firebase}
                    project={project}
                    awardCategoryOptions={awardCategoryOptions}
                    awardList={awardList}
                    userList={userList}
                    group={{id: project.group, ...groupsList[project.group]}}
                    submissionsClosed={false}
                    isOlderYear={true}
                  />
                );
              })}
            </ul>
          </div>
        )}
        {showProjects && (
          <div className="Project-list-section">
            {!!winningProjects.length && (
              <div>
                <h3 className="Project-section-header">Awards</h3>
                <ul className="list-group Project-List">
                  {winningProjects.map((project) => {
                    return (
                      <ProjectListItem
                        key={project.key}
                        auth={auth}
                        firebase={firebase}
                        project={project}
                        awardCategoryOptions={awardCategoryOptions}
                        awardList={awardList}
                        userList={userList}
                        group={{id: project.group, ...groupsList[project.group]}}
                        submissionsClosed={true}
                        isOlderYear={true}
                      />
                    );
                  })}
                </ul>
              </div>
            )}
            {!!actualProjects.length && (
              <div>
                {!!winningProjects.length && (
                  <h3 className="Project-section-header">All Projects</h3>
                )}
                <ul className="list-group Project-List">
                  {actualProjects.map((project) => {
                    return (
                      <ProjectListItem
                        key={project.key}
                        auth={auth}
                        firebase={firebase}
                        project={project}
                        awardCategoryOptions={awardCategoryOptions}
                        awardList={awardList}
                        userList={userList}
                        group={{id: project.group, ...groupsList[project.group]}}
                        submissionsClosed={true}
                        isOlderYear={true}
                      />
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="Project-list-tabs">
          <ul className="tabs">
            <li style={{fontWeight: showIdeas ? 'bold' : null}}>
              <Link
                to={{
                  pathname: this.props.location.pathname,
                  query: {
                    show: 'ideas',
                  },
                }}
              >
                Ideas{' '}
                <span
                  className={
                    showIdeas
                      ? 'Project-list-count-active'
                      : 'Project-list-count-inactive'
                  }
                >
                  {projectIdeas.length === 0 ? '0' : projectIdeas.length}
                </span>
              </Link>
            </li>
            <li style={{fontWeight: showProjects ? 'bold' : null}}>
              <Link
                to={{
                  pathname: this.props.location.pathname,
                  query: {
                    show: 'projects',
                  },
                }}
              >
                Projects{' '}
                <span
                  className={
                    showProjects
                      ? 'Project-list-count-active'
                      : 'Project-list-count-inactive'
                  }
                >
                  {actualProjects.length === 0 ? '0' : actualProjects.length}
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  renderBody(year) {
    let {
      auth,
      awardCategoryList,
      awardList,
      firebase,
      projectList,
      userList,
      groupsList,
    } = this.props;

    const isOlderYear = this.props.params.year && currentYear !== this.props.params.year;

    if (!groupsList) {
      groupsList = {};
    }

    if (!isLoaded(projectList)) return <div className="loading-indicator">Loading..</div>;

    let submissionsClosed = year.submissionsClosed;
    if (submissionsClosed) {
      return this.renderClosedYear();
    }

    let projects = mapObject(projectList);
    if (this.state.groupFilter) {
      if (this.state.groupFilter.value === '') {
        projects = projects.filter((project) => !project.group);
      } else {
        projects = projects.filter(
          (project) => project.group === this.state.groupFilter.value
        );
      }
    }
    let projectsLFH = [];
    let projectIdeas = [];
    let otherProjects = [];
    projects.forEach((p) => {
      if (p.isIdea) projectIdeas.push(p);
      else if (p.needHelp) projectsLFH.push(p);
      else otherProjects.push(p);
    });

    const showParam = this.props.location.query.show;
    const showIdeas = !showParam || showParam === 'ideas';
    const showProjects = showParam === 'projects';
    const hasAnyProjects = projectsLFH.length > 0 || otherProjects.length > 0;
    const hasAnyIdeas = projectIdeas.length > 0;

    let userVotes = year ? getAuthUserVotes(auth.uid, year.votes) : [];
    let awardCategoryOptions = getAwardCategories(awardCategoryList);

    let emptyState = null;
    if (showProjects && !hasAnyProjects) {
      emptyState = (
        <div className="alert alert-block alert-info">
          Oops! No projects have been created yet for this year!
        </div>
      );
    }
    if (showIdeas && !hasAnyIdeas) {
      emptyState = (
        <div className="alert alert-block alert-info">
          Oops! No project ideas have been submitted yet for this year!
        </div>
      );
    }

    return (
      <div className="Project-list-container">
        {emptyState}
        {showIdeas && projectIdeas.length > 0 && (
          <div className="Project-list-section">
            <ul className="Project-List Project">
              {projectIdeas.map((project) => {
                return (
                  <ProjectListItem
                    key={project.key}
                    auth={auth}
                    userVote={userVotes.filter((v) => v.project === project.key)}
                    firebase={firebase}
                    project={project}
                    awardCategoryOptions={awardCategoryOptions}
                    awardList={awardList}
                    userList={userList}
                    group={{id: project.group, ...groupsList[project.group]}}
                    submissionsClosed={submissionsClosed}
                    isOlderYear={isOlderYear}
                  />
                );
              })}
            </ul>
          </div>
        )}
        {showProjects && projectsLFH.length + otherProjects.length > 0 && (
          <div className="Project-list-section">
            <ul className="Project-List Project">
              {[...projectsLFH, ...otherProjects].map((project) => (
                <ProjectListItem
                  key={project.key}
                  auth={auth}
                  userVote={userVotes.filter((v) => v.project === project.key)}
                  firebase={firebase}
                  project={project}
                  awardCategoryOptions={awardCategoryOptions}
                  awardList={awardList}
                  userList={userList}
                  group={{id: project.group, ...groupsList[project.group]}}
                  submissionsClosed={submissionsClosed}
                  isOlderYear={isOlderYear}
                />
              ))}
            </ul>
          </div>
        )}
        <div className="Project-list-tabs">
          <ul className="tabs">
            <li style={{fontWeight: showIdeas ? 'bold' : null}}>
              <Link
                to={{
                  pathname: this.props.location.pathname,
                  query: {
                    show: 'ideas',
                  },
                }}
              >
                Ideas{' '}
                <span
                  className={
                    showIdeas
                      ? 'Project-list-count-active'
                      : 'Project-list-count-inactive'
                  }
                >
                  {projectIdeas.length === 0 ? '0' : projectIdeas.length}
                </span>
              </Link>
            </li>
            <li style={{fontWeight: showProjects ? 'bold' : null}}>
              <Link
                to={{
                  pathname: this.props.location.pathname,
                  query: {
                    show: 'projects',
                  },
                }}
              >
                Projects{' '}
                <span
                  className={
                    showProjects
                      ? 'Project-list-count-active'
                      : 'Project-list-count-inactive'
                  }
                >
                  {projectsLFH.length + otherProjects.length === 0
                    ? '0'
                    : projectsLFH.length + otherProjects.length}
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  onChangeGroupFilter = (groupFilter) => {
    this.setState({groupFilter});
  };

  render() {
    let year = this.props.year;
    if (!year) {
      if (this.props.params.year) {
        return null;
      }
      year = {
        votingEnabled: false,
        submissionsClosed: false,
      };
    }

    // TODO(dcramer): just make sure the UI is correct for old years
    if (this.props.params.year && currentYear !== this.props.params.year) {
      year.votingEnabled = false;
      year.submissionsClosed = true;
    }

    let votes = [];
    if (this.props.auth && this.props.awardCategoryList && this.props.projectList) {
      let userVotes = year ? getAuthUserVotes(this.props.auth.uid, year.votes) : [];
      let awardCategoryOptions = getAwardCategories(this.props.awardCategoryList);
      let projectList = this.props.projectList;
      votes = userVotes.map((v) => ({
        project: Object.values(projectList).find((p) => p.key === v.project),
        award: awardCategoryOptions[v.awardCategory],
      }));
    }

    return (
      <Layout>
        <PageHeader
          title="Hackweek"
          currentYear={this.props.params.year || currentYear}
          showAddProjectButton={!year.submissionsClosed}
        />
        {this.renderBody(year)}
      </Layout>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];
const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect((props) => [
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      populates: [],
      storeAs: 'userList',
    },
    {
      path: `/years/${props.params.year || currentYear}/awards`,
      queryParams: ['orderByChild=name'],
      populates: keyPopulates,
      storeAs: 'awardList',
    },
    {
      path: `/years/${props.params.year || currentYear}/awardCategories`,
      queryParams: ['orderByChild=name'],
      storeAs: 'awardCategoryList',
    },
    {
      path: `/years/${props.params.year || currentYear}/projects`,
      queryParams: ['orderByChild=name'],
      populates: projectPopulates,
      storeAs: 'activeProjects',
    },
    {
      path: `/years/${props.params.year || currentYear}/groups`,
      queryParams: ['orderByValue=name'],
      populates: [],
      storeAs: 'groupsList',
    },
    {
      path: `/years/${props.params.year || currentYear}`,
      storeAs: 'year',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    year: orderedPopulatedDataToJS(firebase, 'year'),
    awardCategoryList: orderedPopulatedDataToJS(firebase, 'awardCategoryList'),
    awardList: orderedPopulatedDataToJS(firebase, 'awardList', keyPopulates),
    projectList: orderedPopulatedDataToJS(firebase, 'activeProjects', projectPopulates),
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
    groupsList: orderedPopulatedDataToJS(firebase, 'groupsList'),
  }))
)(ProjectList);
