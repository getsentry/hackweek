import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import YearCard from '../components/YearCard';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';

class Admin extends Component {
  static propTypes = {
    auth: PropTypes.object,
    firebase: PropTypes.object,
    yearList: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  render() {
    let {yearList} = this.props;
    if (!isLoaded(yearList)) return <div className="loading-indocator">Loading...</div>;

    return (
      <Layout>
        <PageHeader title="admin" />
        <div className="year-cards-grid">
          {mapObject(yearList)
            .sort((a, b) => b.key - a.key)
            .map((year) => (
              <YearCard key={year.key} year={year.key} to={`/admin/years/${year.key}`} />
            ))}
        </div>
      </Layout>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];

export default compose(
  firebaseConnect(({params}) => [
    {
      path: `/years`,
      populates: keyPopulates,
      storeAs: 'yearList',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    yearList: orderedPopulatedDataToJS(firebase, 'yearList', keyPopulates),
  }))
)(Admin);
