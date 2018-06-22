import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded} from 'react-redux-firebase';

import './YearList.css';

import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import Layout from '../components/Layout';

class ProjectList extends Component {
  static propTypes = {
    userList: PropTypes.object,
    yearList: PropTypes.object,
  };

  renderBody() {
    let {userList, yearList} = this.props;
    if (!isLoaded(yearList) || !isLoaded(userList))
      return <div className="loading-indicator">Loading..</div>;

    return (
      <div>
        <ul className="list-group Year-list">
          {Object.keys(yearList)
            .sort((a, b) => b - a)
            .map(year => {
              let projects = yearList[year].projects || {};
              let awardList = mapObject(yearList[year].awards || {});
              let allMembers = new Set();
              Object.values(projects).forEach(project => {
                Object.keys(project.members || {}).forEach(memberKey => {
                  allMembers.add(memberKey);
                });
              });
              allMembers = Array.from(allMembers);
              return (
                <li key={year} className="Year">
                  <div className="Year-name">
                    <Link to={`/years/${year}/projects`}>
                      {year} <span className="glyphicon glyphicon-circle-arrow-right" />
                    </Link>
                  </div>
                  {!!allMembers.length && (
                    <div className="Year-section">
                      <ul className="Year-member-list">
                        {allMembers
                          .map(k => userList[k])
                          .filter(m => m !== null)
                          .sort((a, b) =>
                            ('' + a.displayName).localeCompare(b.displayName)
                          )
                          .map(member => {
                            return (
                              <li key={member.email} title={member.displayName}>
                                <img
                                  src={member.avatarUrl}
                                  className="Year-member-avatar"
                                  alt="avatar"
                                />
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}
                  {!!awardList.length && (
                    <div className="Year-section">
                      <ul className="Year-award-list">
                        {awardList
                          .sort((a, b) => ('' + a.name).localeCompare(b.name))
                          .filter(award => award.project && projects[award.project])
                          .map(award => {
                            let project = projects[award.project];
                            return (
                              <li key={award.name}>
                                <em>{award.name}</em> &mdash;{' '}
                                <Link to={`/years/${year}/projects/${award.project}`}>
                                  {project.name}
                                </Link>
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      </div>
    );
  }

  render() {
    return (
      <Layout>
        <div>
          <h2>The Archives</h2>
        </div>
        {this.renderBody()}
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
      path: `/years`,
      queryParams: [],
      populates: [],
      storeAs: 'yearList',
    },
  ]),
  connect(({firebase}) => ({
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
    yearList: orderedPopulatedDataToJS(firebase, 'yearList'),
  }))
)(ProjectList);
