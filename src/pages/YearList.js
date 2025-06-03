import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded} from 'react-redux-firebase';

import './YearList.css';

import {mapObject, orderedPopulatedDataToJS} from '../helpers';

import Layout from '../components/Layout';
import {slugify} from '../utils';
import PageHeader from '../components/PageHeader';
import YearListItem from './YearListItem';

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
            .map((year) => (
              <YearListItem
                key={year}
                year={year}
                yearData={yearList[year]}
                userList={userList}
              />
            ))}
        </ul>
      </div>
    );
  }

  render() {
    const {yearList} = this.props;
    const years = yearList ? Object.keys(yearList).sort((a, b) => b - a) : [];
    return (
      <Layout>
        <div>
          <PageHeader title="Hackweek Archives" />
          <div className="Layout-horizontal-container">
            <div className="Layout-main-section">{this.renderBody()}</div>
            <div className="Layout-sidebar">
              <ul className="tabs">
                {years.map((year) => (
                  <li key={year}>
                    <Link to={`/years/${year}/projects`}>{year}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
}

export default compose(
  firebaseConnect((props) => [
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
