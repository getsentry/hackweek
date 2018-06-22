import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import {orderedPopulatedDataToJS} from '../helpers';

class ManageYearDetails extends Component {
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
      <div className="row">
        <div className="col-md-8">
          <h3>Details</h3>
          <div className="form-group">
            <label>Year</label>
            <input
              className="form-control"
              type="text"
              name="year"
              value={yearKey}
              readonly
              disabled
            />
          </div>
        </div>
        <div className="col-md-3 col-md-offset-1">
          <h3>Stats</h3>
          <dl>
            <dt>Projects</dt>
            <dd>{Object.keys(year.projects || {}).length}</dd>
            <dt>Awards</dt>
            <dd>{Object.keys(year.awards || {}).length}</dd>
          </dl>
        </div>
      </div>
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
)(ManageYearDetails);
