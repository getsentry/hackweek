import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';
import summarize from 'summarize-markdown';

import './VotingPage.css';

import {currentYear} from '../config';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import {orderedPopulatedDataToJS} from '../helpers';
import {slugify} from '../utils';
import {customStyles} from '../components/SelectComponents';
import {
  NO_CATEGORY_SECTION_KEY,
  findExistingVoteForCategory,
  findProjectByKey,
  getAwardCategoryOptions,
  getAuthUserVotes,
  getVoteKey,
  getVotesByCategory,
  groupProjectsByAwardCategory,
  isProjectMember,
} from '../voting';

const compactCategorySelectStyles = {
  ...customStyles,
  control: (provided, state) => ({
    ...customStyles.control(provided, state),
    minHeight: '32px',
    height: '32px',
    borderWidth: '2px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 600,
  }),
  valueContainer: (provided) => ({
    ...provided,
    alignItems: 'center',
    display: 'flex',
    height: '28px',
    padding: '0 8px',
  }),
  input: (provided) => ({
    ...provided,
    margin: 0,
    padding: 0,
    color: 'var(--color-gray100)',
  }),
  placeholder: (provided) => ({
    ...provided,
    color: 'var(--color-gray300)',
    marginBottom: 0,
    marginTop: 0,
    top: '50%',
    transform: 'translateY(calc(-50% + 2px))',
  }),
  singleValue: (provided) => ({
    ...provided,
    color: 'var(--color-gray100)',
    marginBottom: 0,
    marginTop: 0,
    top: '50%',
    transform: 'translateY(calc(-50% + 2px))',
  }),
  indicatorsContainer: (provided) => ({
    ...provided,
    height: '28px',
  }),
  dropdownIndicator: (provided) => ({
    ...provided,
    padding: '4px 6px',
  }),
  indicatorSeparator: (provided) => ({
    ...provided,
    height: '18px',
    marginBottom: '5px',
    marginTop: '5px',
  }),
};

function getProjectLink(project, yearKey) {
  const year = project.year || yearKey;
  const projectSlug = slugify(project.name);
  return currentYear === year
    ? `/projects/${project.key}/${projectSlug}`
    : `/years/${year}/projects/${project.key}/${projectSlug}`;
}

function getVideoPreview(videoUrl) {
  if (!videoUrl) return null;

  const driveMatch = videoUrl.match(/https:\/\/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch && driveMatch[1]) {
    return {
      type: 'iframe',
      src: `https://drive.google.com/file/d/${driveMatch[1]}/preview`,
    };
  }

  if (videoUrl.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) {
    return {
      type: 'video',
      src: videoUrl,
    };
  }

  return null;
}

function projectMatchesSearch(project, userList, searchQuery) {
  const normalizedQuery = (searchQuery || '').trim().toLowerCase();
  if (!normalizedQuery) return true;

  if ((project.name || '').toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  return Object.keys(project.members || {}).some((memberKey) => {
    const member = userList?.[memberKey];
    return (
      (member?.displayName || '').toLowerCase().includes(normalizedQuery) ||
      (member?.email || '').toLowerCase().includes(normalizedQuery)
    );
  });
}

function projectMatchesGroup(project, selectedGroup) {
  if (!selectedGroup || selectedGroup === 'all') return true;
  return project.group === selectedGroup;
}

function getGroupFilterOptions(projectList, groupsList) {
  const countsByGroup = {};
  let allProjectsCount = 0;

  Object.keys(projectList || {}).forEach((projectKey) => {
    const project = projectList[projectKey];
    if (project.isIdea) return;

    allProjectsCount += 1;
    if (project.group) {
      countsByGroup[project.group] = (countsByGroup[project.group] || 0) + 1;
    }
  });

  const groups = Object.keys(countsByGroup)
    .map((groupId) => ({
      id: groupId,
      name: groupsList?.[groupId]?.name || 'Unknown',
      count: countsByGroup[groupId],
    }))
    .sort((a, b) => ('' + a.name).localeCompare(b.name));

  return {
    allProjectsCount,
    groups,
  };
}

class VotingProjectCard extends Component {
  static propTypes = {
    awardCategoryOptions: PropTypes.array,
    auth: PropTypes.object,
    categoryKey: PropTypes.string,
    group: PropTypes.object,
    isVotingEnabled: PropTypes.bool,
    onNavigate: PropTypes.func,
    onOpenCategoryPicker: PropTypes.func,
    onSelectNoCategoryVote: PropTypes.func,
    onVote: PropTypes.func,
    pickerOpen: PropTypes.bool,
    previewCardKey: PropTypes.string,
    project: PropTypes.object,
    projectVotes: PropTypes.array,
    sectionKey: PropTypes.string,
    selectedPickerOption: PropTypes.object,
    userList: PropTypes.object,
    userVote: PropTypes.object,
    onPreviewToggle: PropTypes.func,
  };

  onCardKeyDown = (e) => {
    if (e.target === e.currentTarget && e.key === 'Enter') {
      this.props.onNavigate(this.props.project);
    }
  };

  onPreviewVideoRef = (video) => {
    if (!video) return;
    const playPromise = video.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {});
    }
  };

  renderPreview() {
    const {onPreviewToggle, previewCardKey, project, sectionKey} = this.props;
    const cardKey = `${sectionKey}:${project.key}`;
    if (previewCardKey !== cardKey) return null;

    const preview = getVideoPreview(project.videoUrl);
    if (!preview) return null;

    return (
      <div className="VotingCard-videoFrame" onClick={(e) => e.stopPropagation()}>
        <div className="VotingCard-videoOverlay">
          <h3 className="VotingCard-videoTitle no-forced-lowercase">{project.name}</h3>
          <button
            type="button"
            className="VotingCard-videoClose"
            aria-label="Close video"
            onClick={(e) => {
              e.stopPropagation();
              onPreviewToggle(cardKey);
            }}
          >
            X
          </button>
        </div>
        <div className="VotingCard-videoEmbed">
          {preview.type === 'iframe' ? (
            <iframe
              src={preview.src}
              allow="autoplay"
              title={`${project.name} video`}
            />
          ) : (
            <video
              ref={this.onPreviewVideoRef}
              src={preview.src}
              autoPlay
              controls
              playsInline
              preload="auto"
            />
          )}
        </div>
      </div>
    );
  }

  render() {
    const {
      awardCategoryOptions,
      auth,
      categoryKey,
      group,
      isVotingEnabled,
      onNavigate,
      onOpenCategoryPicker,
      onSelectNoCategoryVote,
      onVote,
      pickerOpen,
      project,
      projectVotes,
      sectionKey,
      selectedPickerOption,
      userList,
      userVote,
      onPreviewToggle,
    } = this.props;
    const cardKey = `${sectionKey}:${project.key}`;
    const hasPreview = !!getVideoPreview(project.videoUrl);
    const isPreviewOpen = this.props.previewCardKey === cardKey;
    const projectVoteCategoryNames = (projectVotes || []).map((vote) => {
      const category = awardCategoryOptions.find(
        (option) => option.value === vote.awardCategory
      );
      return category?.label || vote.awardCategory;
    });
    const hasOtherProjectVote = (projectVotes || []).some(
      (vote) => vote.awardCategory !== categoryKey
    );
    const moveVoteCategoryNames = (projectVotes || [])
      .filter((vote) => vote.awardCategory !== categoryKey)
      .map((vote) => {
        const category = awardCategoryOptions.find(
          (option) => option.value === vote.awardCategory
        );
        return category?.label || vote.awardCategory;
      });
    const projectMembers = Object.keys(project.members || {})
      .map((memberKey) => userList?.[memberKey])
      .filter((member) => member != null)
      .sort((a, b) => ('' + a.displayName).localeCompare(b.displayName));
    const visibleMembers = projectMembers.slice(0, 3);
    const remainingMembersCount = Math.max(projectMembers.length - visibleMembers.length, 0);
    const ownProject = isProjectMember(project, auth?.uid);
    const votedForThisProject = userVote?.project === project.key;
    const disableVote = !isVotingEnabled || ownProject || votedForThisProject;
    let voteLabel = 'Vote';

    if (!isVotingEnabled) voteLabel = 'Voting closed';
    else if (ownProject) voteLabel = 'Own project';
    else if (votedForThisProject) voteLabel = 'Voted';
    else if (categoryKey && hasOtherProjectVote) voteLabel = 'Move vote here';

    return (
      <li
        className={`VotingCard ${isPreviewOpen ? 'VotingCard--videoOpen' : ''}`}
        role={isPreviewOpen ? undefined : 'link'}
        tabIndex={isPreviewOpen ? undefined : 0}
        onClick={() => {
          if (!isPreviewOpen) onNavigate(project);
        }}
        onKeyDown={this.onCardKeyDown}
      >
        {this.renderPreview()}
        {!isPreviewOpen && (
          <>
            <div className="VotingCard-tags">
              {group?.id && <span className="Tag Tag--group">{group.name}</span>}
              {!!projectVoteCategoryNames.length && (
                <span className="Tag Tag--vote">
                  <span className="vote-label">Voted</span>{' '}
                  {projectVoteCategoryNames.join(', ')}
                </span>
              )}
            </div>
            <h3 className="VotingCard-title no-forced-lowercase">{project.name}</h3>
            <p className="VotingCard-summary no-forced-lowercase">
              {summarize(project.summary)}
            </p>
            {!!visibleMembers.length && (
              <div className="VotingCard-members">
                {visibleMembers.map((member) => (
                  <span className="Project-member Tag Tag--member" key={member.email}>
                    <Avatar user={member} />
                    <span className="Project-member-name">{member.displayName}</span>
                  </span>
                ))}
                {remainingMembersCount > 0 && (
                  <span className="Project-member Tag Tag--member">
                    +{remainingMembersCount} more
                  </span>
                )}
              </div>
            )}
            <div className="VotingCard-actions" onClick={(e) => e.stopPropagation()}>
              {hasPreview && (
                <Button
                  priority="secondary"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviewToggle(cardKey);
                  }}
                >
                  Video
                </Button>
              )}
              {sectionKey === NO_CATEGORY_SECTION_KEY && pickerOpen ? (
                <div className="VotingCard-categoryPicker">
                  <Select
                    styles={compactCategorySelectStyles}
                    name={`category-${project.key}`}
                    value={selectedPickerOption}
                    isMulti={false}
                    options={awardCategoryOptions}
                    onChange={(choice) => onSelectNoCategoryVote(project, choice)}
                    placeholder="Choose category"
                  />
                </div>
              ) : (
                <div
                  className="VotingCard-voteAction"
                  data-has-tooltip={!!moveVoteCategoryNames.length}
                >
                  {!!moveVoteCategoryNames.length && (
                    <span className="VotingCard-moveTooltip" role="tooltip">
                      Moves from {moveVoteCategoryNames.join(', ')}
                    </span>
                  )}
                  <Button
                    priority="primary"
                    size="xs"
                    disabled={disableVote}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sectionKey === NO_CATEGORY_SECTION_KEY) {
                        onOpenCategoryPicker(project);
                      } else {
                        onVote(categoryKey, project, sectionKey);
                      }
                    }}
                  >
                    {voteLabel}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </li>
    );
  }
}

class VotingPage extends Component {
  static propTypes = {
    auth: PropTypes.object,
    awardCategoryList: PropTypes.object,
    firebase: PropTypes.object,
    groupsList: PropTypes.object,
    params: PropTypes.object,
    projectList: PropTypes.object,
    userList: PropTypes.object,
    year: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {
      collapsedSections: {},
      categoryPickerProjectKey: null,
      categoryPickerValue: null,
      previewCardKey: null,
      searchQuery: '',
      selectedGroup: 'all',
    };
  }

  onChangeSearch = (e) => {
    this.setState({searchQuery: e.target.value});
  };

  onSelectGroup = (groupId) => {
    this.setState({
      selectedGroup: groupId,
      previewCardKey: null,
    });
  };

  onPreviewToggle = (cardKey) => {
    this.setState(({previewCardKey}) => ({
      previewCardKey: previewCardKey === cardKey ? null : cardKey,
    }));
  };

  onToggleSection = (sectionKey, isCollapsed) => {
    this.setState((state) => ({
      collapsedSections: {
        ...state.collapsedSections,
        [sectionKey]: !isCollapsed,
      },
    }));
  };

  onNavigateProject = (project) => {
    this.context.router.push(getProjectLink(project, this.getYearKey()));
  };

  onOpenCategoryPicker = (project) => {
    this.setState({
      categoryPickerProjectKey: project.key,
      categoryPickerValue: null,
    });
  };

  onSelectNoCategoryVote = (project, choice) => {
    if (!choice) {
      this.setState({categoryPickerValue: null});
      return;
    }
    this.setState({categoryPickerValue: choice}, () => {
      this.onVote(choice.value, project, NO_CATEGORY_SECTION_KEY);
    });
  };

  onVote = (awardCategoryKey, project, sectionKey) => {
    const {auth, awardCategoryList, firebase, year} = this.props;
    if (!year?.votingEnabled || !awardCategoryKey || !auth?.uid) return;
    if (isProjectMember(project, auth.uid)) return;

    const existingVote = findExistingVoteForCategory(
      year.votes,
      auth.uid,
      awardCategoryKey,
      project.key
    );

    if (existingVote) {
      const existingProject = findProjectByKey(this.props.projectList, existingVote.project);
      const categoryName = awardCategoryList?.[awardCategoryKey]?.name || awardCategoryKey;
      const projectName = existingProject?.name || 'Unknown Project';
      const confirmMessage = `You already gave "${projectName}" the "${categoryName}" category vote. Do you want to retract that vote and move it to this project?`;

      if (!window.confirm(confirmMessage)) return;
    }

    const voteKey = getVoteKey(auth.uid, awardCategoryKey);
    const updates = {
      [`/years/${this.getYearKey()}/votes/${voteKey}`]: {
        creator: auth.uid,
        project: project.key,
        awardCategory: awardCategoryKey,
        ts: Date.now(),
      },
    };

    getAuthUserVotes(auth.uid, year.votes)
      .filter(
        (vote) =>
          vote.project === project.key && vote.awardCategory !== awardCategoryKey
      )
      .forEach((vote) => {
        updates[
          `/years/${this.getYearKey()}/votes/${getVoteKey(
            auth.uid,
            vote.awardCategory
          )}`
        ] = null;
      });

    firebase
      .database()
      .ref()
      .update(updates)
      .then(() => {
        this.setState((state) => ({
          collapsedSections: {
            ...state.collapsedSections,
            [sectionKey]: true,
            [awardCategoryKey]: true,
          },
          categoryPickerProjectKey: null,
          categoryPickerValue: null,
        }));
      });
  };

  getYearKey() {
    return this.props.params.year || currentYear;
  }

  isSectionCollapsed(sectionKey, hasVote) {
    if (this.state.searchQuery.trim()) return false;
    if (Object.prototype.hasOwnProperty.call(this.state.collapsedSections, sectionKey)) {
      return this.state.collapsedSections[sectionKey];
    }
    return !!hasVote;
  }

  renderGroupFilter(groupFilterOptions) {
    if (!groupFilterOptions.groups.length) return null;

    return (
      <div
        className="VotingGroupFilter"
        role="tablist"
        aria-label="Group filter"
      >
        <button
          type="button"
          className={this.state.selectedGroup === 'all' ? 'active' : ''}
          onClick={() => this.onSelectGroup('all')}
        >
          All Projects <span className="count">{groupFilterOptions.allProjectsCount}</span>
        </button>
        {groupFilterOptions.groups.map((group) => (
          <button
            type="button"
            key={group.id}
            className={this.state.selectedGroup === group.id ? 'active' : ''}
            onClick={() => this.onSelectGroup(group.id)}
          >
            {group.name} <span className="count">{group.count}</span>
          </button>
        ))}
      </div>
    );
  }

  renderSection(section, votesByCategory, awardCategoryOptions) {
    const {auth, groupsList, projectList, userList, year} = this.props;
    const userVotes = getAuthUserVotes(auth.uid, year?.votes);
    const categoryVote = section.category ? votesByCategory[section.key] : null;
    const votedProject = categoryVote
      ? findProjectByKey(projectList, categoryVote.project)
      : null;
    const isCollapsed = this.isSectionCollapsed(section.key, !!categoryVote);

    return (
      <section
        className="VotingSection"
        data-collapsed={isCollapsed}
        key={section.key}
      >
        <button
          type="button"
          className="VotingSection-header"
          onClick={() => this.onToggleSection(section.key, isCollapsed)}
          aria-expanded={!isCollapsed}
        >
          <span className="VotingSection-title">
            <h3 className="no-forced-lowercase">{section.title}</h3>
            <span className="VotingSection-count">{section.projects.length}</span>
            {votedProject && (
              <span className="VotingSection-voted">
                Voted: {votedProject.name}
              </span>
            )}
          </span>
          <span className="VotingSection-caret" />
        </button>
        {!isCollapsed && (
          <>
            {section.projects.length ? (
              <ul className="VotingGrid">
                {section.projects.map((project) => (
                  <VotingProjectCard
                    key={project.key}
                    auth={auth}
                    awardCategoryOptions={awardCategoryOptions}
                    categoryKey={section.category?.key}
                    group={{id: project.group, ...groupsList?.[project.group]}}
                    isVotingEnabled={!!year?.votingEnabled}
                    onNavigate={this.onNavigateProject}
                    onOpenCategoryPicker={this.onOpenCategoryPicker}
                    onPreviewToggle={this.onPreviewToggle}
                    onSelectNoCategoryVote={this.onSelectNoCategoryVote}
                    onVote={this.onVote}
                    pickerOpen={this.state.categoryPickerProjectKey === project.key}
                    previewCardKey={this.state.previewCardKey}
                    project={project}
                    projectVotes={userVotes.filter((vote) => vote.project === project.key)}
                    sectionKey={section.key}
                    selectedPickerOption={this.state.categoryPickerValue}
                    userList={userList || {}}
                    userVote={categoryVote}
                  />
                ))}
              </ul>
            ) : (
              <div className="alert alert-block alert-info VotingPage-empty">
                No projects in this section yet.
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  render() {
    const {auth, awardCategoryList, groupsList, projectList, userList, year} =
      this.props;
    const yearKey = this.getYearKey();

    if (
      !isLoaded(auth) ||
      !isLoaded(year) ||
      !isLoaded(awardCategoryList) ||
      !isLoaded(projectList) ||
      !isLoaded(groupsList) ||
      !isLoaded(userList)
    ) {
      return <div className="loading-indicator">Loading..</div>;
    }

    const searchFilteredProjectList = Object.keys(projectList || {}).reduce((result, key) => {
      const project = projectList[key];
      if (projectMatchesSearch(project, userList, this.state.searchQuery)) {
        result[key] = project;
      }
      return result;
    }, {});
    const groupFilterOptions = getGroupFilterOptions(searchFilteredProjectList, groupsList);
    const filteredProjectList = Object.keys(searchFilteredProjectList).reduce(
      (result, key) => {
        const project = searchFilteredProjectList[key];
        if (projectMatchesGroup(project, this.state.selectedGroup)) {
          result[key] = project;
        }
        return result;
      },
      {}
    );
    const sections = groupProjectsByAwardCategory(filteredProjectList, awardCategoryList);
    const votesByCategory = getVotesByCategory(auth.uid, year?.votes);
    const awardCategoryOptions = getAwardCategoryOptions(awardCategoryList);

    return (
      <Layout>
        <div className="VotingPage">
          <PageHeader title="Voting" currentYear={yearKey} />
          {!year?.votingEnabled && (
            <div className="alert alert-block alert-info">
              Voting is not open for this year.
            </div>
          )}
          <div className="VotingSearch">
            <input
              className="form-control VotingSearch-input"
              type="search"
              value={this.state.searchQuery}
              onChange={this.onChangeSearch}
              placeholder="Search projects or team members"
              aria-label="Search projects or team members"
            />
          </div>
          {this.renderGroupFilter(groupFilterOptions)}
          {sections.map((section) =>
            this.renderSection(section, votesByCategory, awardCategoryOptions)
          )}
        </div>
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
      storeAs: 'votingUserList',
    },
    {
      path: `/years/${props.params.year || currentYear}/awardCategories`,
      queryParams: ['orderByChild=name'],
      populates: keyPopulates,
      storeAs: 'votingAwardCategoryList',
    },
    {
      path: `/years/${props.params.year || currentYear}/projects`,
      queryParams: ['orderByChild=name'],
      populates: projectPopulates,
      storeAs: 'votingProjectList',
    },
    {
      path: `/years/${props.params.year || currentYear}/groups`,
      queryParams: ['orderByValue=name'],
      populates: [],
      storeAs: 'votingGroupsList',
    },
    {
      path: `/years/${props.params.year || currentYear}`,
      storeAs: 'votingYear',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    year: orderedPopulatedDataToJS(firebase, 'votingYear'),
    awardCategoryList: orderedPopulatedDataToJS(
      firebase,
      'votingAwardCategoryList',
      keyPopulates
    ),
    projectList: orderedPopulatedDataToJS(
      firebase,
      'votingProjectList',
      projectPopulates
    ),
    userList: orderedPopulatedDataToJS(firebase, 'votingUserList'),
    groupsList: orderedPopulatedDataToJS(firebase, 'votingGroupsList'),
  }))
)(VotingPage);
