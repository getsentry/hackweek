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

class EditProject extends Component {
  static propTypes = {
    auth: PropTypes.object,
    userList: PropTypes.object,
    project: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {};
  }

  componentWillReceiveProps({project, userList}) {
    let props = this.props;
    if (isLoaded(project) && isLoaded(userList) && Object.keys(this.state).length === 0) {
      this.setState({
        name: project.name,
        summary: project.summary,
        team: Object.keys(project.members),
      });
    }
  }

  onSubmit = e => {
    e.preventDefault();

    let {auth, firebase, params, project} = this.props;

    firebase
      .update(`/years/${params.year || currentYear}/projects/${params.projectKey}`, {
        name: this.state.name,
        summary: this.state.summary,
      })
      .then(snapshot => {
        let updates = {};
        this.state.team.forEach(({value}) => {
          updates[
            `/years/${params.year ||
              currentYear}/projects/${params.projectKey}/members/${value}`
          ] = {
            ts: new Date().getTime(),
          };
        });
        Object.keys(project.members || {}).forEach(memberKey => {
          let path = `/years/${params.year ||
            currentYear}/projects/${params.projectKey}/members/${memberKey}`;
          if (!updates.hasOwnProperty(path)) {
            updates[path] = null;
          }
        });
        firebase
          .database()
          .ref()
          .update(updates)
          .then(() => {
            this.context.router.push(
              `/years/${params.year || currentYear}/projects/${params.projectKey}`
            );
          });
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
        <h2>Edit Project</h2>
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
          <button className="btn btn-primary">Save Changes</button>
        </form>
      </Layout>
    );
  }
}

export default compose(
  firebaseConnect(props => [
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      populates: [],
      storeAs: 'userList',
    },
    {
      path: `/years/${props.params.year || currentYear}/projects/${props.params
        .projectKey}`,
      populates: [],
      storeAs: 'project',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    project: orderedPopulatedDataToJS(firebase, 'project'),
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
  }))
)(EditProject);
