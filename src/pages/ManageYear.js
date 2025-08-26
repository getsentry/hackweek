import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import Layout from '../components/Layout';
import TabNavigation from '../components/TabNavigation';
import {orderedPopulatedDataToJS} from '../helpers';

class ManageYear extends Component {
  static propTypes = {
    auth: PropTypes.object,
    firebase: PropTypes.object,
    year: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  render() {
    let {year} = this.props;
    if (!isLoaded(year)) return <div className="loading-indocator">Loading...</div>;

    let yearKey = this.props.params.year;

    const tabs = [
      {to: `/admin/years/${yearKey}`, label: 'Overview', index: true},
      {to: `/admin/years/${yearKey}/award-categories`, label: 'Award Categories'},
      {to: `/admin/years/${yearKey}/awards`, label: 'Awards'},
      {to: `/admin/years/${yearKey}/votes`, label: 'Votes'},
      {to: `/admin/years/${yearKey}/groups`, label: 'Groups'},
    ];

    return (
      <Layout>
        <h2>Hackweek {yearKey}</h2>
        <TabNavigation tabs={tabs} />
        {this.props.children}
      </Layout>
    );
  }
}

export default compose(
  firebaseConnect(({params}) => [
    {
      path: `/years/${params.year}`,
      keyProp: 'key',
      storeAs: 'year',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    year: orderedPopulatedDataToJS(firebase, 'year'),
  }))
)(ManageYear);
