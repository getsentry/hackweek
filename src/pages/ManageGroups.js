import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import {currentYear} from '../config';

class GroupRow extends Component {
  static propTypes = {
    group: PropTypes.object,
    onDelete: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    year: PropTypes.string.isRequired,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(props, ...args) {
    super(props, ...args);
    this.state = {
      name: '',
      ...(props.group || {}),
    };
  }

  onChangeField = (e) => {
    this.setState({
      [e.target.name]: e.target.value,
    });
  };

  hasChanges() {
    let {group} = this.props;
    let state = this.state;
    if (!group) return state.name;
    return group.name !== state.name;
  }

  onSuccess = () => {
    if (!this.props.group) {
      this.setState({name: ''});
    }
  };

  render() {
    let {group} = this.props;
    return (
      <form
        onSubmit={(e) =>
          e.preventDefault() && this.props.onSave(this.state, this.onSuccess)
        }
        className="form Group-Form"
      >
        <div className="row">
          <div className="col-sm-5">
            <input
              className="form-control"
              type="text"
              name="name"
              value={this.state.name}
              onChange={this.onChangeField}
              required
            />
          </div>
          <div className="col-sm-2">
            <button
              className="btn btn-primary"
              disabled={!this.hasChanges()}
              onClick={() => this.props.onSave(this.state, this.onSuccess)}
            >
              <span className="glyphicon glyphicon-ok" />
            </button>
            {!!group && (
              <button
                className="btn btn-danger"
                style={{marginLeft: 5}}
                onClick={() => this.props.onDelete(this.state)}
              >
                <span className="glyphicon glyphicon-remove" />
              </button>
            )}
          </div>
        </div>
      </form>
    );
  }
}

class ManageGroups extends Component {
  static propTypes = {
    auth: PropTypes.object,
    groupsList: PropTypes.object,
    projectsList: PropTypes.object,
    firebase: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {};
  }

  onDelete = (group) => {
    let {firebase, params, projectsList} = this.props;
    firebase.remove(`/years/${params.year}/groups/${group.key}`).then(async () => {
      const projectsToUpdate = Object.values(projectsList).filter(
        (project) => project.group === group.key
      );
      await Promise.all(
        projectsToUpdate.map((project) =>
          firebase.update(`/years/${project.year}/projects/${project.key}`, {
            group: null,
          })
        )
      );
    });
  };

  onSave = (group, onSuccess) => {
    let {auth, firebase, params} = this.props;
    let {year} = params;
    if (group.key) {
      firebase
        .update(`/years/${year}/groups/${group.key}`, {
          name: group.name,
        })
        .then(onSuccess);
    } else {
      firebase
        .push(`/years/${year}/groups`, {
          name: group.name,
          ts: Date.now(),
          creator: auth.uid,
          year,
        })
        .then(onSuccess);
    }
  };

  render() {
    let {groupsList, auth} = this.props;
    if (!isLoaded(auth) || !isLoaded(groupsList))
      return <div className="loading-indocator">Loading...</div>;

    let {year} = this.props.params;

    return (
      <div>
        {mapObject(groupsList)
          .sort((a, b) => ('' + a.name).localeCompare(b.name))
          .map((group) => (
            <GroupRow
              key={group.key}
              group={group}
              onSave={this.onSave}
              onDelete={this.onDelete}
              year={year}
            />
          ))}
        <GroupRow onSave={this.onSave} onDelete={this.onDelete} year={year} />
      </div>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];
const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

export default compose(
  firebaseConnect(({params}) => [
    {
      path: `/years/${params.year}/groups`,
      queryParams: ['orderByValue=name'],
      populates: keyPopulates,
      storeAs: 'groupsList',
    },
    {
      path: `/years/${params.year || currentYear}/projects`,
      queryParams: ['orderByChild=name'],
      populates: projectPopulates,
      storeAs: 'activeProjects',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    groupsList: orderedPopulatedDataToJS(firebase, 'groupsList', keyPopulates),
    projectsList: orderedPopulatedDataToJS(firebase, 'activeProjects', projectPopulates),
  }))
)(ManageGroups);
