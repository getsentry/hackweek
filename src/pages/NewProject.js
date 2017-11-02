import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';

import './ProjectList.css';

import {currentYear} from '../config';
import Layout from '../components/Layout';

class NewProject extends Component {
  static propTypes = {
    auth: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {
      team: [],
    };
  }

  onSubmit = e => {
    e.preventDefault();

    let {auth} = this.props;

    this.props.firebase
      .push('/projects', {
        name: this.state.name,
        summary: this.state.summary,
        team: this.state.team,
        ts: new Date().getTime(),
        year: currentYear,
        creator: auth.uid,
      })
      .then(() => {
        this.context.router.push('/');
      });
  };

  onChangeField = e => {
    this.setState({
      [e.target.name]: e.target.value,
    });
  };

  onChangeTeam = team => {
    this.setState({team});
  };

  render() {
    let options = [
      {value: 'david@sentry.io', label: 'David Cramer'},
      {value: 'chris@sentry.io', label: 'Chris Jennings'},
    ];

    return (
      <Layout>
        <h1 style={{textAlign: 'center'}}>Add a New Project</h1>
        <form onSubmit={this.onSubmit} className="form New-Project-Form">
          <div className="form-group">
            <label>Project Name</label>
            <input
              className="form-control"
              type="text"
              name="name"
              value={this.state.name}
              onChange={this.onChangeField}
              required
            />
          </div>
          <div className="form-group">
            <label>Summary</label>
            <textarea
              className="form-control"
              name="summary"
              value={this.state.summary}
              onChange={this.onChangeField}
              required
            />
          </div>
          <div className="form-group">
            <label>Team</label>
            <Select
              name="team"
              value={this.state.team}
              multi={true}
              options={options}
              onChange={this.onChangeTeam}
            />
          </div>
          <button className="btn btn-primary">Add</button>
        </form>
      </Layout>
    );
  }
}

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
  }))
)(NewProject);
