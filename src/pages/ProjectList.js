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
    userVote: PropTypes.array,
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
      userVote,
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
            <div className="Project-tags">
              {group.id && <span className="Tag Tag--group">{group.name}</span>}
              {userVote && userVote.length > 0 && userVote[0].awardCategory && (
                <span className="Tag Tag--vote">
                  <span className="vote-label">You Voted</span>{' '}
                  {awardCategoryOptions[userVote[0].awardCategory]?.name ||
                    userVote[0].awardCategory}
                </span>
              )}
            </div>
            <Link to={link}>
              <h3 className="no-forced-lowercase">{project.name}</h3>
            </Link>
            {/* Project Summary or Members/Badges */}
            <p className="Project-idea-summary no-forced-lowercase clamp-3">
              {summarize(project.summary)}
            </p>

            <div className="Project-member-list-condensed">
              {projectMembers.length > 0 &&
                projectMembers.map((member) => (
                  <div className="Project-member Tag Tag--member" key={member.email}>
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

// Card-style renderer for gallery view
class ProjectCardItem extends Component {
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
    userVote: PropTypes.array,
  };

  render() {
    const {
      awardList,
      awardCategoryOptions,
      submissionsClosed,
      project,
      userList,
      group,
      isOlderYear,
      userVote,
    } = this.props;

    const link =
      currentYear === project.year
        ? `/projects/${project.key}/${slugify(project.name)}`
        : `/years/${project.year}/projects/${project.key}/${slugify(project.name)}`;

    const projectMembers = userList
      ? Object.keys(project.members || {})
          .map((memberKey) => userList[memberKey])
          .filter((member) => member != null)
      : [];

    const awards = mapObject(awardList)
      .filter((award) => award.project === project.key)
      .map((award) => ({
        ...award,
        name: Object.values(awardCategoryOptions).find(
          (aco) => aco.key === award.awardCategory
        )?.name,
      }));

    // hide project if its not executed on
    if (submissionsClosed && project.isIdea) return null;

    const hasHeaderTags = Boolean(group.id) || (project.needHelp && !submissionsClosed);
    const MEMBER_LIMIT = 3;
    const visibleMembers = projectMembers.slice(0, MEMBER_LIMIT);
    const remainingMembersCount = Math.max(projectMembers.length - MEMBER_LIMIT, 0);

    return (
      <li className="ProjectCard">
        {hasHeaderTags && (
          <div className="ProjectCard-header">
            <div className="Project-tags">
              {group.id && <span className="Tag Tag--group">{group.name}</span>}
              {userVote && userVote.length > 0 && userVote[0].awardCategory && (
                <span className="Tag Tag--vote">
                  <span className="vote-label">You Voted</span>{' '}
                  {awardCategoryOptions[userVote[0].awardCategory]?.name ||
                    userVote[0].awardCategory}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="ProjectCard-body">
          {awards.length > 0 && (
            <div className="ProjectCard-awards ProjectCard-awards--top">
              {awards.map((a) => a.name).join(', ')}{' '}
              <span
                className="glyphicon glyphicon-star"
                title={awards.map((a) => a.name).join(', ')}
              />
            </div>
          )}
          <Link to={link}>
            <h3 className="ProjectCard-title no-forced-lowercase">{project.name}</h3>
          </Link>
          <p className="ProjectCard-summary no-forced-lowercase">
            {summarize(project.summary)}
          </p>
        </div>
        {(() => {
          const hasActions =
            (project.isIdea || projectMembers.length === 0) &&
            !submissionsClosed &&
            !isOlderYear;
          const hasAwards = !!awards.length;
          const hasMembers = projectMembers.length > 0;
          if (!hasActions && !hasMembers) return null;
          return (
            <div className="ProjectCard-footer">
              {hasMembers && (
                <div className="ProjectCard-members">
                  {visibleMembers.map((member) => (
                    <div className="Project-member Tag Tag--member" key={member.email}>
                      <Avatar user={member} />
                      <span className="Project-member-name">{member.displayName}</span>
                    </div>
                  ))}
                  {remainingMembersCount > 0 && (
                    <div
                      className="Project-member Tag Tag--member"
                      title={`${remainingMembersCount} more`}
                    >
                      +{remainingMembersCount} more
                    </div>
                  )}
                </div>
              )}
              <div className="ProjectCard-actions">
                {hasActions && (
                  <Link
                    to={`/years/${project.year}/projects/${project.key}/edit?claim`}
                    className="btn-set-btn"
                  >
                    <Button priority="secondary" size="xs">
                      Claim Project
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })()}
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
    this.state = {
      groupFilter: null,
      isWide: typeof window !== 'undefined' ? window.innerWidth >= 640 : true,
      showIdeasTab: false, // Add this line to hide the Ideas tab
      showMyStuffTab: false, // Add this line to hide the My Stuff tab
      selectedRegion: 'all', // Default to All Projects
      regionCounts: {
        westCoast: 0,
        eastCoast: 0,
        europe: 0,
        allProjects: 0,
        myVotes: 0,
      },
    };
  }

  componentDidMount() {
    this._handleResize = () => {
      const isWide = window.innerWidth >= 640;
      if (isWide !== this.state.isWide) this.setState({isWide});
    };
    window.addEventListener('resize', this._handleResize);
    this._handleResize();
  }

  componentDidUpdate(prevProps) {
    // Update region counts when projectList or groupsList changes
    if (
      prevProps.projectList !== this.props.projectList ||
      prevProps.groupsList !== this.props.groupsList
    ) {
      this.calculateRegionCounts();
    }

    // Update myVotes count when year or auth changes
    if (prevProps.year !== this.props.year || prevProps.auth !== this.props.auth) {
      this.updateMyVotesCount();
    }
  }

  calculateRegionCounts() {
    const {projectList, groupsList} = this.props;
    if (!projectList || !groupsList) return;

    const projects = mapObject(projectList);
    const westCoast = projects.filter((project) => {
      const group = groupsList[project.group];
      return (
        group &&
        (group.name.toLowerCase().includes('west') ||
          group.name.toLowerCase().includes('california') ||
          group.name.toLowerCase().includes('seattle'))
      );
    }).length;

    const eastCoast = projects.filter((project) => {
      const group = groupsList[project.group];
      return (
        group &&
        (group.name.toLowerCase().includes('east') ||
          group.name.toLowerCase().includes('new york') ||
          group.name.toLowerCase().includes('boston'))
      );
    }).length;

    const europe = projects.filter((project) => {
      const group = groupsList[project.group];
      return (
        group &&
        (group.name.toLowerCase().includes('europe') ||
          group.name.toLowerCase().includes('london') ||
          group.name.toLowerCase().includes('berlin'))
      );
    }).length;

    this.setState({
      regionCounts: {
        westCoast,
        eastCoast,
        europe,
        allProjects: projects.length,
        myVotes: 0, // This will be updated separately since it depends on user votes
      },
    });
  }

  updateMyVotesCount() {
    const {year, auth} = this.props;
    if (!year || !auth) return;

    const userVotes = year ? getAuthUserVotes(auth.uid, year.votes) : [];
    this.setState((prevState) => ({
      regionCounts: {
        ...prevState.regionCounts,
        myVotes: userVotes.length,
      },
    }));
  }

  componentWillUnmount() {
    if (this._handleResize) window.removeEventListener('resize', this._handleResize);
  }

  renderControls({
    showIdeas,
    showProjects,
    showMyProjects,
    showMyVotes,
    ideaCount,
    projectCount,
    myProjectsCount,
    myVotesCount,
    viewStyle,
    westCoastCount,
    eastCoastCount,
    europeCount,
    allProjectsCount,
  }) {
    const {pathname, query} = this.props.location;
    const currentShow = showIdeas
      ? 'ideas'
      : showProjects
      ? 'projects'
      : showMyProjects
      ? 'my-projects'
      : showMyVotes
      ? 'my-votes'
      : query.show || 'ideas';
    const currentView = (this.state.isWide ? viewStyle || query.view : 'list') || 'list';

    return (
      <div className="Project-controls">
        <div className="Project-controls-left">
          {this.state.showIdeasTab && (
            <Link
              className={`Control-pill ${currentShow === 'ideas' ? 'active' : ''}`}
              to={{pathname, query: {...query, show: 'ideas'}}}
            >
              Ideas <span className="count">{ideaCount || 0}</span>
            </Link>
          )}
          {/* <Link
            className={`Control-pill ${currentShow === 'projects' ? 'active' : ''}`}
            to={{pathname, query: {...query, show: 'projects'}}}
          >
            All Projects <span className="count">{projectCount || 0}</span>
          </Link> */}
          {this.state.showMyStuffTab && (
            <Link
              className={`Control-pill ${currentShow === 'my-projects' ? 'active' : ''}`}
              to={{pathname, query: {...query, show: 'my-projects'}}}
            >
              My Stuff <span className="count">{myProjectsCount || 0}</span>
            </Link>
          )}
          {/* <Link
            className={`Control-pill ${currentShow === 'my-votes' ? 'active' : ''}`}
            to={{pathname, query: {...query, show: 'my-votes'}}}
          >
            My Votes <span className="count">{myVotesCount || 0}</span>
          </Link> */}

          <div className="RegionToggle" role="tablist" aria-label="Region toggle">
            <button
              className={this.state.selectedRegion === 'all' ? 'active' : ''}
              onClick={() => this.setState({selectedRegion: 'all'})}
            >
              All Projects <span className="count">{allProjectsCount || 0}</span>
            </button>
            <button
              className={this.state.selectedRegion === 'west' ? 'active' : ''}
              onClick={() => this.setState({selectedRegion: 'west'})}
            >
              West Coast <span className="count">{westCoastCount || 0}</span>
            </button>
            <button
              className={this.state.selectedRegion === 'east' ? 'active' : ''}
              onClick={() => this.setState({selectedRegion: 'east'})}
            >
              East Coast <span className="count">{eastCoastCount || 0}</span>
            </button>
            <button
              className={this.state.selectedRegion === 'europe' ? 'active' : ''}
              onClick={() => this.setState({selectedRegion: 'europe'})}
            >
              Europe <span className="count">{europeCount || 0}</span>
            </button>
            <button
              className={this.state.selectedRegion === 'my-votes' ? 'active' : ''}
              onClick={() => this.setState({selectedRegion: 'my-votes'})}
            >
              My Votes{' '}
              <span className="count">{this.state.regionCounts.myVotes || 0}</span>
            </button>
          </div>
        </div>
        <div className="Project-controls-right">
          {this.state.isWide && (
            <div className="ViewToggle" role="tablist" aria-label="View toggle">
              <Link
                className={currentView === 'list' ? 'active' : ''}
                to={{pathname, query: {...query, view: 'list'}}}
              >
                List
              </Link>
              <Link
                className={currentView === 'grid' ? 'active' : ''}
                to={{pathname, query: {...query, view: 'grid'}}}
              >
                Grid
              </Link>
            </div>
          )}
        </div>
      </div>
    );
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

    // Apply region filtering for closed years
    if (this.state.selectedRegion !== 'all') {
      if (this.state.selectedRegion === 'west') {
        projects = projects.filter((project) => {
          const group = groupsList[project.group];
          return (
            group &&
            (group.name.toLowerCase().includes('west') ||
              group.name.toLowerCase().includes('california') ||
              group.name.toLowerCase().includes('seattle'))
          );
        });
      } else if (this.state.selectedRegion === 'east') {
        projects = projects.filter((project) => {
          const group = groupsList[project.group];
          return (
            group &&
            (group.name.toLowerCase().includes('east') ||
              group.name.toLowerCase().includes('new york') ||
              group.name.toLowerCase().includes('boston'))
          );
        });
      } else if (this.state.selectedRegion === 'europe') {
        projects = projects.filter((project) => {
          const group = groupsList[project.group];
          return (
            group &&
            (group.name.toLowerCase().includes('europe') ||
              group.name.toLowerCase().includes('london') ||
              group.name.toLowerCase().includes('berlin'))
          );
        });
      } else if (this.state.selectedRegion === 'my-votes') {
        // Filter for projects the user has voted on
        const userVotes = year ? getAuthUserVotes(auth.uid, year.votes) : [];
        projects = projects.filter((project) =>
          userVotes.some((vote) => vote.project === project.key)
        );
      }
    }

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
    let userVotes = year ? getAuthUserVotes(auth.uid, year.votes) : [];

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
    const {show: showParam, view: viewParam} = this.props.location.query;
    const showIdeas = !showParam || showParam === 'ideas';
    const showProjects = showParam === 'projects';
    const showMyProjects = showParam === 'my-projects';
    const showMyVotes = showParam === 'my-votes';
    let viewStyle = viewParam === 'grid' ? 'grid' : 'list';
    if (!this.state.isWide) viewStyle = 'list';

    // Separate projects and ideas for filtering
    let projectIdeas = [];
    let actualProjects = [];
    let myProjects = [];
    projects.forEach((p) => {
      if (Object.keys(p.members || {}).includes(auth.uid)) myProjects.push(p);
      if (p.isIdea) projectIdeas.push(p);
      else actualProjects.push(p);
    });

    return (
      <div className="Project-list-container">
        {this.renderControls({
          showIdeas,
          showProjects,
          showMyProjects,
          showMyVotes,
          ideaCount: projectIdeas.length,
          projectCount: actualProjects.length,
          myProjectsCount: myProjects.length,
          myVotesCount: userVotes.length,
          viewStyle,
          westCoastCount: this.state.regionCounts.westCoast,
          eastCoastCount: this.state.regionCounts.eastCoast,
          europeCount: this.state.regionCounts.europe,
          allProjectsCount: this.state.regionCounts.allProjects,
        })}

        {showIdeas && projectIdeas.length > 0 && (
          <div className="Project-list-section">
            {viewStyle === 'grid' ? (
              <ul className="Project-grid">
                {projectIdeas.map((project) => (
                  <ProjectCardItem
                    key={project.key}
                    auth={auth}
                    userVote={userVotes.filter((v) => v.project === project.key)}
                    firebase={firebase}
                    project={project}
                    awardCategoryOptions={awardCategoryOptions}
                    awardList={awardList}
                    userList={userList}
                    group={{id: project.group, ...groupsList[project.group]}}
                    submissionsClosed={false}
                    isOlderYear={true}
                  />
                ))}
              </ul>
            ) : (
              <ul className="Project-List Project">
                {projectIdeas.map((project) => (
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
                    submissionsClosed={false}
                    isOlderYear={true}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {showMyProjects && myProjects.length > 0 && (
          <div className="Project-list-section">
            {viewStyle === 'grid' ? (
              <ul className="Project-grid">
                {myProjects.map((project) => (
                  <ProjectCardItem
                    key={project.key}
                    auth={auth}
                    userVote={userVotes.filter((v) => v.project === project.key)}
                    firebase={firebase}
                    project={project}
                    awardCategoryOptions={awardCategoryOptions}
                    awardList={awardList}
                    userList={userList}
                    group={{id: project.group, ...groupsList[project.group]}}
                    submissionsClosed={false}
                    isOlderYear={true}
                  />
                ))}
              </ul>
            ) : (
              <ul className="Project-List Project">
                {myProjects.map((project) => (
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
                    submissionsClosed={false}
                    isOlderYear={true}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {showMyVotes && myVotedProjects.length > 0 && (
          <div className="Project-list-section">
            {viewStyle === 'grid' ? (
              <ul className="Project-grid">
                {myVotedProjects.map((project) => (
                  <ProjectCardItem
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
            ) : (
              <ul className="Project-List Project">
                {myVotedProjects.map((project) => (
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
            )}
          </div>
        )}

        {showProjects && (
          <div className="Project-list-section">
            {!!winningProjects.length && (
              <div>
                <h3 className="Project-section-header">Awards</h3>
                {viewStyle === 'grid' ? (
                  <ul className="Project-grid">
                    {winningProjects.map((project) => (
                      <ProjectCardItem
                        key={project.key}
                        auth={auth}
                        userVote={userVotes.filter((v) => v.project === project.key)}
                        firebase={firebase}
                        project={project}
                        awardCategoryOptions={awardCategoryOptions}
                        awardList={awardList}
                        userList={userList}
                        group={{id: project.group, ...groupsList[project.group]}}
                        submissionsClosed={true}
                        isOlderYear={true}
                      />
                    ))}
                  </ul>
                ) : (
                  <ul className="list-group Project-List">
                    {winningProjects.map((project) => (
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
                        submissionsClosed={true}
                        isOlderYear={true}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!!myProjects.length && (
              <div>
                <h3 className="Project-section-header">My Stuff</h3>
                {viewStyle === 'grid' ? (
                  <ul className="Project-grid">
                    {myProjects.map((project) => (
                      <ProjectCardItem
                        key={project.key}
                        auth={auth}
                        userVote={userVotes.filter((v) => v.project === project.key)}
                        firebase={firebase}
                        project={project}
                        awardCategoryOptions={awardCategoryOptions}
                        awardList={awardList}
                        userList={userList}
                        group={{id: project.group, ...groupsList[project.group]}}
                        submissionsClosed={true}
                        isOlderYear={true}
                      />
                    ))}
                  </ul>
                ) : (
                  <ul className="list-group Project-List">
                    {myProjects.map((project) => (
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
                        submissionsClosed={true}
                        isOlderYear={true}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!!actualProjects.length && (
              <div>
                {!!winningProjects.length && (
                  <h3 className="Project-section-header">All Projects</h3>
                )}
                {viewStyle === 'grid' ? (
                  <ul className="Project-grid">
                    {actualProjects.map((project) => (
                      <ProjectCardItem
                        key={project.key}
                        auth={auth}
                        userVote={userVotes.filter((v) => v.project === project.key)}
                        firebase={firebase}
                        project={project}
                        awardCategoryOptions={awardCategoryOptions}
                        awardList={awardList}
                        userList={userList}
                        group={{id: project.group, ...groupsList[project.group]}}
                        submissionsClosed={true}
                        isOlderYear={true}
                      />
                    ))}
                  </ul>
                ) : (
                  <ul className="list-group Project-List">
                    {actualProjects.map((project) => (
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
                        submissionsClosed={true}
                        isOlderYear={true}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
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

    // Apply region filtering
    if (this.state.selectedRegion !== 'all') {
      if (this.state.selectedRegion === 'west') {
        projects = projects.filter((project) => {
          // Filter for West Coast projects - you can customize this logic
          const group = groupsList[project.group];
          return (
            group &&
            (group.name.toLowerCase().includes('west') ||
              group.name.toLowerCase().includes('california') ||
              group.name.toLowerCase().includes('seattle'))
          );
        });
      } else if (this.state.selectedRegion === 'east') {
        projects = projects.filter((project) => {
          // Filter for East Coast projects
          const group = groupsList[project.group];
          return (
            group &&
            (group.name.toLowerCase().includes('east') ||
              group.name.toLowerCase().includes('new york') ||
              group.name.toLowerCase().includes('boston'))
          );
        });
      } else if (this.state.selectedRegion === 'europe') {
        projects = projects.filter((project) => {
          // Filter for Europe projects
          const group = groupsList[project.group];
          return (
            group &&
            (group.name.toLowerCase().includes('europe') ||
              group.name.toLowerCase().includes('london') ||
              group.name.toLowerCase().includes('berlin'))
          );
        });
      } else if (this.state.selectedRegion === 'my-votes') {
        // Filter for projects the user has voted on
        const userVotes = year ? getAuthUserVotes(auth.uid, year.votes) : [];
        projects = projects.filter((project) =>
          userVotes.some((vote) => vote.project === project.key)
        );
      }
    }

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
    let myProjects = [];
    projects.forEach((p) => {
      if (Object.keys(p.members || {}).includes(auth.uid)) myProjects.push(p);
      if (p.isIdea) projectIdeas.push(p);
      else if (p.needHelp) projectsLFH.push(p);
      else otherProjects.push(p);
    });

    const {show: showParam, view: viewParam} = this.props.location.query;
    const showIdeas = !showParam || showParam === 'ideas';
    const showProjects = showParam === 'projects';
    const showMyProjects = showParam === 'my-projects';
    const showMyVotes = showParam === 'my-votes';
    let viewStyle = viewParam === 'grid' ? 'grid' : 'list';
    if (!this.state.isWide) viewStyle = 'list';
    let userVotes = year ? getAuthUserVotes(auth.uid, year.votes) : [];
    let awardCategoryOptions = getAwardCategories(awardCategoryList);

    const hasAnyProjects = projectsLFH.length > 0 || otherProjects.length > 0;
    const hasAnyIdeas = projectIdeas.length > 0;
    const hasAnyMyProjects = myProjects.length > 0;
    const hasAnyMyVotes = userVotes.length > 0;

    // Get projects the user has voted on
    let myVotedProjects = [];
    if (userVotes.length > 0) {
      myVotedProjects = projects.filter((project) =>
        userVotes.some((vote) => vote.project === project.key)
      );
    }

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
    if (showMyProjects && !hasAnyMyProjects) {
      emptyState = (
        <div className="alert alert-block alert-info">
          Oops! You don't have any projects yet! Create, claim or join a project!
        </div>
      );
    }
    if (showMyVotes && !hasAnyMyVotes) {
      emptyState = (
        <div className="alert alert-block alert-info">
          Oops! You haven't voted on any projects yet!
        </div>
      );
    }

    return (
      <div className="Project-list-container">
        {this.renderControls({
          showIdeas,
          showProjects,
          showMyProjects,
          showMyVotes,
          ideaCount: projectIdeas.length,
          projectCount: projectsLFH.length + otherProjects.length,
          myProjectsCount: myProjects.length,
          myVotesCount: userVotes.length,
          viewStyle,
          westCoastCount: this.state.regionCounts.westCoast,
          eastCoastCount: this.state.regionCounts.eastCoast,
          europeCount: this.state.regionCounts.europe,
          allProjectsCount: this.state.regionCounts.allProjects,
        })}

        {emptyState}

        {showIdeas && projectIdeas.length > 0 && (
          <div className="Project-list-section">
            {viewStyle === 'grid' ? (
              <ul className="Project-grid">
                {projectIdeas.map((project) => (
                  <ProjectCardItem
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
            ) : (
              <ul className="Project-List Project">
                {projectIdeas.map((project) => (
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
            )}
          </div>
        )}

        {showMyProjects && myProjects.length > 0 && (
          <div className="Project-list-section">
            {viewStyle === 'grid' ? (
              <ul className="Project-grid">
                {myProjects.map((project) => (
                  <ProjectCardItem
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
            ) : (
              <ul className="Project-List Project">
                {myProjects.map((project) => (
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
            )}
          </div>
        )}

        {showMyVotes && myVotedProjects.length > 0 && (
          <div className="Project-list-section">
            {viewStyle === 'grid' ? (
              <ul className="Project-grid">
                {myVotedProjects.map((project) => (
                  <ProjectCardItem
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
            ) : (
              <ul className="Project-List Project">
                {myVotedProjects.map((project) => (
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
            )}
          </div>
        )}

        {showProjects && projectsLFH.length + otherProjects.length > 0 && (
          <div className="Project-list-section">
            {viewStyle === 'grid' ? (
              <ul className="Project-grid">
                {[...projectsLFH, ...otherProjects].map((project) => (
                  <ProjectCardItem
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
            ) : (
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
            )}
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
        {/* <p style={{textAlign: 'center', fontWeight: 'bold', marginBottom: '1rem'}}>
          Submit your demo videos{' '}
          <a
            style={{color: 'var(--color-blurple)'}}
            href="https://drive.google.com/drive/u/0/folders/1WoBqogZpFVOv2U818zNo70ldvJUYBpt6"
          >
            here
          </a>{' '}
          in your group's folder.
        </p> */}
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
