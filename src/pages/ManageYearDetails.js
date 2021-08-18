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

  constructor(props, ...args) {
    super(props, ...args);
    this.state = {
      votingEnabled: props.year.votingEnabled,
      submissionsClosed: props.year.submissionsClosed,
    };
  }

  onConfigChange = (cb) => {
    return (e) => {
      let {firebase, params} = this.props;
      let {year} = params;
      let config = cb(e);
      this.setState(config, () => {
        firebase.update(`/years/${year}/`, config);
      });
    };
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
              readOnly
              disabled
            />
          </div>
          <div className="form-group">
            <label>Submissions Closed</label>
            <input
              className="form-control"
              type="checkbox"
              name="submissionsClosed"
              checked={this.state.submissionsClosed}
              onChange={this.onConfigChange((e) => ({
                submissionsClosed: e.target.checked,
              }))}
            />
          </div>
          <div className="form-group">
            <label>Voting Enabled</label>
            <input
              className="form-control"
              type="checkbox"
              name="votingEnabled"
              checked={this.state.votingEnabled}
              onChange={this.onConfigChange((e) => ({
                votingEnabled: e.target.checked,
              }))}
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
