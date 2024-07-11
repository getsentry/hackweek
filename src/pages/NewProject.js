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
import {slugify} from '../utils';

class NewProject extends Component {
  static propTypes = {
    auth: PropTypes.object,
    userList: PropTypes.object,
    groupsList: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {
      team: null,
      needHelp: false,
    };
  }

  componentWillReceiveProps(nextProps) {
    if (this.state.team === null && isLoaded(nextProps.auth)) {
      this.setState({
        team: [
          {
            value: nextProps.auth.uid,
            label: nextProps.auth.displayName,
          },
        ],
      });
    }
  }

  onSubmit = (e) => {
    e.preventDefault();

    let {auth, firebase} = this.props;

    firebase
      .push(`/years/${currentYear}/projects`, {
        name: this.state.name,
        summary: this.state.summary,
        needHelp: this.state.needHelp || false,
        needHelpComments: this.state.needHelpComments || '',
        isIdea: this.state.isIdea || false,
        group: this.state.group,
        year: currentYear,
        ts: Date.now(),
        creator: auth.uid,
      })
      .then((snapshot) => {
        let projectKey = snapshot.key;
        let updates = {};
        this.state.team.forEach(({value}) => {
          updates[`/years/${currentYear}/projects/${projectKey}/members/${value}`] = {
            ts: Date.now(),
          };
          // updates[`/users/${uid}/projects/${projectKey}`] = {
          //   year: currentYear,
          //   name: this.state.name,
          // };
        });
        firebase
          .database()
          .ref()
          .update(updates)
          .then(() => {
            this.context.router.push(
              `/years/${currentYear}/projects/${projectKey}/${slugify(this.state.name)}`
            );
          });
      });
  };

  onChangeField = (e) => {
    this.setState({
      [e.target.name]: e.target.value,
    });
  };

  onChangeTeam = (team) => {
    this.setState({team});
  };

  onChangeGroup = (group) => {
    this.setState({group});
  };

  render() {
    let {auth, userList, groupsList} = this.props;
    if (!isLoaded(auth) || !isLoaded(userList) || !isLoaded(groupsList))
      return <div className="loading-indocator">Loading...</div>;

    let teamOptions = mapObject(userList, (user, userKey) => ({
      value: userKey,
      label: user.displayName,
    }));

    let groupOptions = mapObject(groupsList, (group, groupKey) => ({
      value: groupKey,
      label: group.name,
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
            <label>Group</label>
            <Select
              name="group"
              value={this.state.group}
              multi={false}
              options={groupOptions}
              onChange={this.onChangeGroup}
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
              rows={6}
              required
            />
          </div>
          <div className="form-group">
            <div className="checkbox">
              <label>
                <input
                  type="checkbox"
                  name="isIdea"
                  checked={this.state.isIdea}
                  onChange={(e) => {
                    this.setState({isIdea: e.target.checked});
                  }}
                />{' '}
                This project is just being shared as an idea.
              </label>
            </div>
          </div>
          {!this.state.isIdea && (
            <React.Fragment>
              <div className="form-group">
                <label>Team</label>
                <Select
                  name="team"
                  value={this.state.team}
                  multi={true}
                  options={teamOptions}
                  onChange={this.onChangeTeam}
                />
              </div>
              <h3>Looking for Help?</h3>
              <div className="form-group">
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="needHelp"
                      checked={this.state.needHelp}
                      onChange={(e) => {
                        this.setState({needHelp: e.target.checked});
                      }}
                    />{' '}
                    I'm looking for help on this project!
                  </label>
                </div>
              </div>
              {this.state.needHelp && (
                <div className="form-group">
                  <div className="help-block help-text">
                    What kind of help are you looking for?
                  </div>
                  <textarea
                    className="form-control"
                    name="needHelpComments"
                    value={this.state.needHelpComments}
                    onChange={this.onChangeField}
                    rows={6}
                  />
                </div>
              )}
            </React.Fragment>
          )}
          <div className="btn-set" style={{textAlign: 'right'}}>
            <button className="btn btn-primary">Save Changes</button>
          </div>
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
    {
      path: `/years/${currentYear}/groups`,
      queryParams: ['orderByValue=name'],
      populates: [],
      storeAs: 'groupsList',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
    groupsList: orderedPopulatedDataToJS(firebase, 'groupsList'),
  }))
)(NewProject);
