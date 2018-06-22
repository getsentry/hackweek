import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded} from 'react-redux-firebase';

import './YearList.css';

import {orderedPopulatedDataToJS} from '../helpers';
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
        <ul className="list-group Year-List">
          {Object.keys(yearList)
            .sort((a, b) => b - a)
            .map(year => {
              let projects = yearList[year].projects || {};
              let allMembers = new Set();
              Object.values(projects).forEach(project => {
                Object.keys(project.members || {}).forEach(memberKey => {
                  allMembers.add(memberKey);
                });
              });
              return (
                <li key={year} className="Year">
                  <div className="Year-Name">
                    <Link to={`/years/${year}/projects`}>{year}</Link>
                  </div>
                  <ul className="Year-member-list">
                    {Array.from(allMembers)
                      .sort()
                      .map(k => userList[k])
                      .filter(m => m !== null)
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
