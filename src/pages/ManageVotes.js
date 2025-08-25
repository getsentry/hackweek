import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS, dataToJS} from 'react-redux-firebase';

import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import {slugify} from '../utils';

import VoteTable from '../components/VoteTable';
import '../components/VoteTable.css';
import VoteAnalytics from '../components/VoteAnalytics';
import '../components/VoteAnalytics.css';
import Button from '../components/Button';

class ManageAwardCategories extends Component {
  static propTypes = {
    auth: PropTypes.object,
    awardCategories: PropTypes.object,
    projects: PropTypes.object,
    voteList: PropTypes.object,
    userList: PropTypes.object,
    groups: PropTypes.object,
    firebase: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {};
    this.handleExportCSV = this.handleExportCSV.bind(this);
  }

  handleExportCSV() {
    const {projects, userList, groups} = this.props;

    const csvEscape = (value) => {
      const str = String(value == null ? '' : value);
      return '"' + str.replace(/"/g, '""') + '"';
    };

    // New CSV format with judge columns
    const headers = [
      'Project Link',
      'Project Name',
      'Group',
      'Involved Individuals',
      'Judge 1',
      'Judge 2',
      'Judge 3',
      'Judge 4',
      'Judge 5',
      'Judge 6',
      'Judge 7',
      'Total Votes',
    ];

    const rows = [headers];

    // Get all projects and create rows (exclude ideas)
    Object.keys(projects || {}).forEach((projectKey) => {
      const project = projects[projectKey];
      if (!project || project.isIdea) return;

      const projectName = project.name || projectKey;

      // Generate project link
      const projectLink = `https://hackweek.getsentry.net/years/${
        this.props.params.year
      }/projects/${projectKey}/${slugify(projectName)}`;

      // Get team members' full names
      const projectMembers = Object.keys(project.members || {})
        .map((memberKey) => {
          return userList && userList[memberKey] ? userList[memberKey].displayName : null;
        })
        .filter((member) => member !== null);

      const involvedIndividuals = projectMembers.join(', ');

      // Get group name instead of group ID
      const groupName =
        project.group && groups && groups[project.group]
          ? groups[project.group].name
          : project.group || '';

      // Create row with project info and judge columns (all set to 1 as requested)
      const row = [
        projectLink,
        projectName,
        groupName,
        involvedIndividuals,
        1, // Judge 1
        1, // Judge 2
        1, // Judge 3
        1, // Judge 4
        1, // Judge 5
        1, // Judge 6
        1, // Judge 7
        1, // Total Votes
      ];

      rows.push(row);
    });

    const csvContent = rows.map((row) => row.map(csvEscape).join(',')).join('\n');

    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'votes.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  render() {
    let {awardCategories, voteList, projects, auth} = this.props;
    if (
      !isLoaded(auth) ||
      !isLoaded(awardCategories) ||
      !isLoaded(voteList) ||
      !isLoaded(projects)
    )
      return <div className="loading-indocator">Loading...</div>;

    voteList = mapObject(voteList);
    let votesByProjectAndCategory = {};

    // Calculate unique voters for participation rate
    const uniqueVoters = new Set();

    voteList.forEach((v) => {
      let projectKey = v.project;
      let categoryKey = v.awardCategory;

      // Track unique voters using the creator field
      if (v.creator) {
        uniqueVoters.add(v.creator);
      }

      votesByProjectAndCategory[categoryKey] =
        votesByProjectAndCategory[categoryKey] || {};
      let votesByProject = votesByProjectAndCategory[categoryKey];
      votesByProject[projectKey] = (votesByProject[projectKey] || 0) + 1;
    });

    const uniqueVotersCount = uniqueVoters.size;

    return (
      <div className="admin-page">
        <div style={{marginBottom: '20px'}}>
          <Button onClick={this.handleExportCSV} priority="secondary" size="md">
            Export CSV
          </Button>
        </div>
        <VoteAnalytics
          data={votesByProjectAndCategory}
          awardCategories={awardCategories}
          projects={projects}
          uniqueVotersCount={uniqueVotersCount}
          totalEmployees={432}
        />
        <VoteTable
          data={votesByProjectAndCategory}
          awardCategories={awardCategories}
          projects={projects}
          groups={this.props.groups}
          year={this.props.params.year}
        />
        {Object.keys(votesByProjectAndCategory).map((categoryKey) => {
          let votesByProject = votesByProjectAndCategory[categoryKey];

          return (
            <div key={categoryKey}>
              <h3>{awardCategories[categoryKey].name}</h3>
              <ul>
                {Object.keys(votesByProject)
                  .sort((a, b) => {
                    return votesByProject[a] < votesByProject[b]
                      ? 1
                      : votesByProject[a] > votesByProject[b]
                      ? -1
                      : 0;
                  })
                  .map((projectKey) => {
                    let project = projects[projectKey];
                    return (
                      <li key={projectKey}>
                        <a
                          href={`/years/${this.props.params.year}/projects/${projectKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {project.name}
                        </a>{' '}
                        • {votesByProject[projectKey]}
                      </li>
                    );
                  })}
              </ul>
            </div>
          );
        })}
      </div>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];
const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect(({params}) => [
    {
      path: `/years/${params.year}/awardCategories`,
      populates: keyPopulates,
      storeAs: 'awardCategories',
    },
    {
      path: `/years/${params.year}/projects`,
      populates: projectPopulates,
      storeAs: 'projects',
    },
    {path: `/years/${params.year}/votes`, populates: keyPopulates, storeAs: 'voteList'},
    {
      path: `/years/${params.year}/groups`,
      populates: keyPopulates,
      storeAs: 'groups',
    },
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      populates: [],
      storeAs: 'userList',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    awardCategories: dataToJS(firebase, 'awardCategories'),
    projects: dataToJS(firebase, 'projects'),
    voteList: orderedPopulatedDataToJS(firebase, 'voteList', keyPopulates),
    groups: dataToJS(firebase, 'groups'),
    userList: dataToJS(firebase, 'userList'),
  }))
)(ManageAwardCategories);
