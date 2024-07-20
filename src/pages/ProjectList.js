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
import Select from 'react-select/lib/Select';

function getAuthUserVotes(uid, voteList) {
  return Object.keys(voteList || {})
    .map((voteKey) => ({
      ...voteList[voteKey],
      key: voteKey,
    }))
    .filter((vote) => vote.creator === uid);
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
    userVote: PropTypes.array,
    submissionsClosed: PropTypes.bool,
  };

  render() {
    let {
      awardList,
      awardCategoryOptions,
      submissionsClosed,
      project,
      userList,
      group,
      userVote,
    } = this.props;
    let link =
      currentYear === project.year
        ? `/projects/${project.key}/${slugify(project.name)}`
        : `/years/${project.year}/projects/${project.key}/${slugify(project.name)}`;

    let projectMembers = Object.keys(project.members || {})
      .map((memberKey) => {
        return userList[memberKey];
      })
      .filter((member) => member !== null);
    projectMembers.sort((a, b) => ('' + a.displayName).localeCompare(b.displayName));

    // hide project if its not executed on
    if (submissionsClosed && project.isIdea) return null;

    let awards = mapObject(awardList).filter((award) => award.project === project.key);

    return (
      <li className="list-group-item Project clearfix">
        {(project.isIdea || projectMembers.length === 0) && !submissionsClosed && (
          <div className="Project-idea-claim">
            <Link
              to={`/years/${project.year}/projects/${project.key}/edit?claim`}
              className="btn btn-xs btn-default"
            >
              Claim Project
            </Link>
          </div>
        )}
        {!!awards.length && (
          <div className="Project-award">
            <span
              className="glyphicon glyphicon-star"
              title={awards.map((a) => a.name).join(', ')}
            />
          </div>
        )}
        {!!userVote.length && (
          <div className="Project-vote">
            <span>
              You voted for this ({awardCategoryOptions[userVote[0].awardCategory].name})
            </span>
          </div>
        )}
        <Link to={link}>
          <strong>{project.name}</strong>
        </Link>
        {project.isIdea || projectMembers.length === 0 ? (
          <div className="Project-idea-summary">{summarize(project.summary)}</div>
        ) : (
          <React.Fragment>
            {project.needHelp && !submissionsClosed && (
              <div className="badge">looking for help</div>
            )}
            <div className="Project-member-list-condensed">
              {projectMembers.length ? (
                projectMembers.map((member) => {
                  return (
                    <div className="Project-member" key={member.email}>
                      <Avatar user={member} />
                      <span className="Project-member-name">{member.displayName}</span>
                    </div>
                  );
                })
              ) : (
                <em>up for grabs</em>
              )}
            </div>
            {group.id && (
              <div className={`Project-group-badge ${group.id}`}>{group.name}</div>
            )}
          </React.Fragment>
        )}
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
    let {auth, awardCategoryList, awardList, firebase, projectList, userList, year} =
      this.props;
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

    let userVotes = year ? getAuthUserVotes(auth.uid, year) : [];
    let awardCategoryOptions = getAwardCategories(awardCategoryList);

    return (
      <div>
        {!!winningProjects.length && (
          <div>
            <h3>Awards</h3>
            <ul className="list-group Project-List">
              {winningProjects.map((project) => {
                return (
                  <ProjectListItem
                    key={project.key}
                    auth={auth}
                    firebase={firebase}
                    project={project}
                    awardCategoryOptions={awardCategoryOptions}
                    userVote={userVotes.filter((v) => v.project === project.key)}
                    awardList={awardList}
                    userList={userList}
                    group={{id: project.group, ...groupsList[project.group]}}
                    submissionsClosed={true}
                  />
                );
              })}
            </ul>
          </div>
        )}
        {!!projects.length && (
          <div>
            {!!winningProjects.length && <h3>All Projects</h3>}
            <ul className="list-group Project-List">
              {projects.map((project) => {
                return (
                  <ProjectListItem
                    key={project.key}
                    auth={auth}
                    firebase={firebase}
                    project={project}
                    awardCategoryOptions={awardCategoryOptions}
                    userVote={userVotes.filter((v) => v.project === project.key)}
                    awardList={awardList}
                    userList={userList}
                    group={{id: project.group, ...groupsList[project.group]}}
                    submissionsClosed={true}
                  />
                );
              })}
            </ul>
          </div>
        )}
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

    let showProjects = this.props.location.query.show !== 'ideas';
    let showIdeas = this.props.location.query.show === 'ideas';

    if (!projects.length)
      return (
        <div className="alert alert-block alert-info">
          Oops! No projects have been created yet for this year!
        </div>
      );

    let userVotes = year ? getAuthUserVotes(auth.uid, year.votes) : [];
    let awardCategoryOptions = getAwardCategories(awardCategoryList);

    return (
      <div>
        <ul className="tabs">
          <li style={{fontWeight: showProjects ? 'bold' : null}}>
            <Link
              to={{
                pathname: this.props.location.pathname,
                query: {
                  show: 'projects',
                },
              }}
            >
              Projects ({projectsLFH.length + otherProjects.length})
            </Link>
          </li>
          <li style={{fontWeight: showIdeas ? 'bold' : null}}>
            <Link
              to={{
                pathname: this.props.location.pathname,
                query: {
                  show: 'ideas',
                },
              }}
            >
              Ideas ({projectIdeas.length})
            </Link>
          </li>
        </ul>
        {showIdeas && projectIdeas.length && (
          <div>
            <h3>Project Ideas</h3>
            <p>
              Need an idea? Take a look at these submissions. Claim one by using the [Edit
              Project] action.
            </p>
            <ul className="list-group Project-List">
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
                  />
                );
              })}
            </ul>
          </div>
        )}
        {showProjects && !!projectsLFH.length && (
          <div>
            <h3>Looking for Help</h3>
            <ul className="list-group Project-List">
              {projectsLFH.map((project) => {
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
                  />
                );
              })}
            </ul>
          </div>
        )}
        {showProjects && !!otherProjects.length && (
          <div>
            {!!projectsLFH.length && <h3>Other Projects</h3>}
            <ul className="list-group Project-List">
              {otherProjects.map((project) => {
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
                  />
                );
              })}
            </ul>
          </div>
        )}
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

    const groupOptions = mapObject(
      Object.assign({'': {name: 'No group'}}, this.props.groupsList),
      (group, groupKey) => ({
        value: groupKey,
        label: group.name,
      })
    );

    return (
      <Layout>
        <div>
          {!year.submissionsClosed && (
            <Link
              to="/new-project"
              className="btn btn-sm btn-primary"
              style={{float: 'right'}}
            >
              Add Project
            </Link>
          )}
          <h2>Projects for {this.props.params.year || currentYear}</h2>
        </div>
        <div className="filter-groups">
          <span>Filter groups:</span>
          <Select
            value={this.state.groupFilter}
            multi={false}
            options={groupOptions}
            onChange={this.onChangeGroupFilter}
            required
          />
        </div>
        {currentYear !== (this.props.params.year || currentYear) && (
          <div className="alert alert-block alert-info">
            You're viewing an archive of Hackweek projects for {this.props.params.year}{' '}
            &mdash; <Link to="/projects">Fast forward to {currentYear}</Link>
          </div>
        )}
        {year.votingEnabled && (
          <div className="alert alert-block alert-info">
            Voting is currently enabled! Visit a project to cast your vote &hellip;
          </div>
        )}
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
