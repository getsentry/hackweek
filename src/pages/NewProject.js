import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';

import './ProjectList.css';

import {currentYear} from '../config';
import Layout from '../components/Layout';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';

class NewProject extends Component {
  static propTypes = {
    auth: PropTypes.object,
    userList: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {
      team: null,
    };
  }

  componentWillReceiveProps(nextProps) {
    if (this.state.team === null && isLoaded(nextProps.auth)) {
      this.setState({team: [nextProps.auth.uid]});
    }
  }

  onSubmit = e => {
    e.preventDefault();

    let {auth} = this.props;

    this.props.firebase
      .push(`/years/${currentYear}/projects`, {
        name: this.state.name,
        summary: this.state.summary,
        // team: this.state.team,
        ts: new Date().getTime(),
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
    let {auth, userList} = this.props;
    if (!isLoaded(auth) || !isLoaded(userList))
      return <div className="loading-indocator">Loading...</div>;

    let options = mapObject(userList, (user, userKey) => ({
      value: userKey,
      label: user.displayName,
    }));

    return (
      <Layout>
        <h2>Add a New Project</h2>
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
  firebaseConnect([
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      populates: [],
      storeAs: 'userList',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
  }))
)(NewProject);
