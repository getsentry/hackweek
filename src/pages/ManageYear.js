import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import Layout from '../components/Layout';
import ListLink from '../components/ListLink';
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

    return (
      <Layout>
        <h2>Hackweek {yearKey}</h2>
        <ul className="nav nav-tabs" style={{marginBottom: 20}}>
          <ListLink to={`/admin/years/${yearKey}`} index={true}>
            Overview
          </ListLink>
          <ListLink to={`/admin/years/${yearKey}/award-categories`}>
            Award Categories
          </ListLink>
          <ListLink to={`/admin/years/${yearKey}/awards`}>Awards</ListLink>
          <ListLink to={`/admin/years/${yearKey}/votes`}>Votes</ListLink>
          <ListLink to={`/admin/years/${yearKey}/groups`}>Groups</ListLink>
        </ul>
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
