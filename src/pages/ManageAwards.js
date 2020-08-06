import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';

import {mapObject, orderedPopulatedDataToJS} from '../helpers';

class AwardRow extends Component {
  static propTypes = {
    award: PropTypes.object,
    onDelete: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    projectList: PropTypes.object.isRequired,
    awardCategoryList: PropTypes.object.isRequired,
    year: PropTypes.string.isRequired,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(props, ...args) {
    super(props, ...args);
    this.state = {
      name: '',
      project: null,
      awardCategory: null,
      ...(props.award || {}),
    };
  }

  onChangeField = (e) => {
    this.setState({
      [e.target.name]: e.target.value,
    });
  };

  onChangeProject = (choice) => {
    this.setState({project: choice.value});
  };

  onChangeAwardCategory = (choice) => {
    this.setState({awardCategory: choice.value});
  };

  hasChanges() {
    let {award} = this.props;
    let state = this.state;
    if (!award) return state.name || state.project || state.awardCategory;
    return (
      award.name !== state.name ||
      award.project !== state.project ||
      award.awardCategory !== state.awardCategory
    );
  }

  onSuccess = () => {
    if (!this.props.award) {
      this.setState({name: '', project: null});
    }
  };

  render() {
    let {award, projectList, awardCategoryList} = this.props;
    let projectOptions = mapObject(projectList)
      .sort((a, b) => ('' + a.name).localeCompare(b.name))
      .map((project) => ({
        value: project.key,
        label: project.name,
      }));

    let awardCategoryOptions = mapObject(awardCategoryList)
      .sort((a, b) => ('' + a.name).localeCompare(b.name))
      .map((awardCategory) => ({
        value: awardCategory.key,
        label: awardCategory.name,
      }));

    return (
      <form
        onSubmit={(e) =>
          e.preventDefault() && this.props.onSave(this.state, this.onSuccess)
        }
        className="form Award-Form"
      >
        <div className="row">
          <div className="col-sm-5">
            <Select
              name="category"
              value={this.state.awardCategory}
              multi={false}
              options={awardCategoryOptions}
              onChange={this.onChangeAwardCategory}
            />
          </div>
          <div className="col-sm-5">
            <Select
              name="project"
              value={this.state.project}
              multi={false}
              options={projectOptions}
              onChange={this.onChangeProject}
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
            {!!award && (
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

class ManageAwards extends Component {
  static propTypes = {
    auth: PropTypes.object,
    awardList: PropTypes.object,
    awardCategoryList: PropTypes.object,
    firebase: PropTypes.object,
    projectList: PropTypes.object,
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
    firebase.remove(`/years/${params.year}/awards/${award.key}`);
  };

  onSave = (award, onSuccess) => {
    let {auth, firebase, params} = this.props;
    let {year} = params;
    if (award.key) {
      firebase
        .update(`/years/${year}/awards/${award.key}`, {
          name: award.name,
          project: award.project || null,
          awardCategory: award.awardCategory || null,
        })
        .then(onSuccess);
    } else {
      firebase
        .push(`/years/${year}/awards`, {
          name: award.name,
          project: award.project || null,
          awardCategory: award.awardCategory || null,
          ts: Date.now(),
          creator: auth.uid,
        })
        .then(onSuccess);
    }
  };

  render() {
    let {awardList, auth, projectList, awardCategoryList} = this.props;
    if (
      !isLoaded(auth) ||
      !isLoaded(awardList) ||
      !isLoaded(projectList) ||
      !isLoaded(awardCategoryList)
    )
      return <div className="loading-indocator">Loading...</div>;

    let {year} = this.props.params;

    console.dir(awardCategoryList);
    return (
      <div>
        {mapObject(awardList)
          .sort((a, b) => ('' + a.name).localeCompare(b.name))
          .map((award) => (
            <AwardRow
              key={award.key}
              award={award}
              onSave={this.onSave}
              onDelete={this.onDelete}
              projectList={projectList}
              awardCategoryList={awardCategoryList}
              year={year}
            />
          ))}
        <AwardRow
          onSave={this.onSave}
          onDelete={this.onDelete}
          projectList={projectList}
          awardCategoryList={awardCategoryList}
          year={year}
        />
      </div>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];

export default compose(
  firebaseConnect(({params}) => [
    {
      path: `/years/${params.year}/projects`,
      queryParams: ['orderByChild=name'],
      populates: keyPopulates,
      storeAs: 'projectList',
    },
    {
      path: `/years/${params.year}/awards`,
      queryParams: ['orderByChild=name'],
      populates: keyPopulates,
      storeAs: 'awardList',
    },
    {
      path: `/years/${params.year}/awardCategories`,
      queryParams: ['orderByChild=name'],
      populates: keyPopulates,
      storeAs: 'awardCategoryList',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    awardList: orderedPopulatedDataToJS(firebase, 'awardList', keyPopulates),
    awardCategoryList: orderedPopulatedDataToJS(
      firebase,
      'awardCategoryList',
      keyPopulates
    ),
    projectList: orderedPopulatedDataToJS(firebase, 'projectList', keyPopulates),
  }))
)(ManageAwards);
