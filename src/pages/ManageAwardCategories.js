import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';

import {mapObject, orderedPopulatedDataToJS} from '../helpers';

class AwardCategoryRow extends Component {
  static propTypes = {
    awardCategory: PropTypes.object,
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
      ...(props.awardCategory || {}),
    };
  }

  onChangeField = (e) => {
    this.setState({
      [e.target.name]: e.target.value,
    });
  };

  hasChanges() {
    let {awardCategory} = this.props;
    let state = this.state;
    if (!awardCategory) return state.name;
    return awardCategory.name !== state.name;
  }

  onSuccess = () => {
    if (!this.props.awardCategory) {
      this.setState({name: ''});
    }
  };

  render() {
    let {awardCategory} = this.props;
    return (
      <form
        onSubmit={(e) =>
          e.preventDefault() && this.props.onSave(this.state, this.onSuccess)
        }
        className="form Award-Form"
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
            {!!awardCategory && (
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

class ManageAwardCategories extends Component {
  static propTypes = {
    auth: PropTypes.object,
    awardCategoryList: PropTypes.object,
    firebase: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {};
  }

  onDelete = (award) => {
    let {firebase, params} = this.props;
    firebase.remove(`/years/${params.year}/awardCategories/${award.key}`);
  };

  onSave = (award, onSuccess) => {
    let {auth, firebase, params} = this.props;
    let {year} = params;
    if (award.key) {
      firebase
        .update(`/years/${year}/awardCategories/${award.key}`, {
          name: award.name,
        })
        .then(onSuccess);
    } else {
      firebase
        .push(`/years/${year}/awardCategories`, {
          name: award.name,
          ts: Date.now(),
          creator: auth.uid,
        })
        .then(onSuccess);
    }
  };

  render() {
    let {awardCategoryList, auth} = this.props;
    if (!isLoaded(auth) || !isLoaded(awardCategoryList))
      return <div className="loading-indocator">Loading...</div>;

    let {year} = this.props.params;

    return (
      <div>
        {mapObject(awardCategoryList)
          .sort((a, b) => ('' + a.name).localeCompare(b.name))
          .map((awardCategory) => (
            <AwardCategoryRow
              key={awardCategory.key}
              awardCategory={awardCategory}
              onSave={this.onSave}
              onDelete={this.onDelete}
              year={year}
            />
          ))}
        <AwardCategoryRow onSave={this.onSave} onDelete={this.onDelete} year={year} />
      </div>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];

export default compose(
  firebaseConnect(({params}) => [
    {
      path: `/years/${params.year}/awardCategories`,
      queryParams: ['orderByChild=name'],
      populates: keyPopulates,
      storeAs: 'awardCategoryList',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    awardCategoryList: orderedPopulatedDataToJS(
      firebase,
      'awardCategoryList',
      keyPopulates
    ),
  }))
)(ManageAwardCategories);
