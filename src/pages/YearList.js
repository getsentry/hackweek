import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded} from 'react-redux-firebase';

import './ProjectList.css';

import {orderedPopulatedDataToJS} from '../helpers';
import Layout from '../components/Layout';

class ProjectList extends Component {
  static propTypes = {
    yearList: PropTypes.object,
  };

  renderBody() {
    let {yearList} = this.props;
    if (!isLoaded(yearList)) return <div className="loading-indicator">Loading..</div>;

    return (
      <div>
        <ul className="list-group Project-List">
          {Object.keys(yearList).map(year => {
            console.log(yearList[year]);
            return (
              <li key={year}>
                <Link to={`/years/${year}/projects`}>{year}</Link> &mdash;{' '}
                {Object.keys(yearList[year].projects).length} projects
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
      path: `/years`,
      queryParams: [],
      populates: [],
      storeAs: 'yearList',
    },
  ]),
  connect(({firebase}) => ({
    yearList: orderedPopulatedDataToJS(firebase, 'yearList'),
  }))
)(ProjectList);
