import React, {Component} from 'react';
import PropTypes from 'prop-types';

import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';

import {customStyles} from '../components/SelectComponents';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';

class AwardRow extends Component {
  static propTypes = {
    award: PropTypes.object,
    onDelete: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    projectList: PropTypes.object.isRequired,
    awardCategoryList: PropTypes.object.isRequired,
    year: PropTypes.string.isRequired,
    usedAwardCategories: PropTypes.array,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(props, ...args) {
    super(props, ...args);

    // Build options for hydration
    const projectOptions = mapObject(props.projectList)
      .sort((a, b) => ('' + a.name).localeCompare(b.name))
      .map((project) => ({
        value: project.key,
        label: project.name,
      }));

    const awardCategoryOptions = mapObject(props.awardCategoryList)
      .sort((a, b) => ('' + a.name).localeCompare(b.name))
      .map((awardCategory) => ({
        value: awardCategory.key,
        label: awardCategory.name,
      }));

    let project = props.award?.project;
    if (project && typeof project === 'string') {
      project = projectOptions.find((opt) => opt.value === project) || null;
    }

    let awardCategory = props.award?.awardCategory;
    if (awardCategory && typeof awardCategory === 'string') {
      awardCategory =
        awardCategoryOptions.find((opt) => opt.value === awardCategory) || null;
    }

    this.state = {
      name: props.award?.name || '',
      project,
      awardCategory,
      ...(props.award || {}),
    };
  }

  componentDidUpdate(prevProps) {
    // Only hydrate if the award or the lists have changed
    if (
      prevProps.award !== this.props.award ||
      prevProps.projectList !== this.props.projectList ||
      prevProps.awardCategoryList !== this.props.awardCategoryList
    ) {
      const projectOptions = mapObject(this.props.projectList)
        .sort((a, b) => ('' + a.name).localeCompare(b.name))
        .map((project) => ({
          value: project.key,
          label: project.name,
        }));

      const awardCategoryOptions = mapObject(this.props.awardCategoryList)
        .sort((a, b) => ('' + a.name).localeCompare(b.name))
        .map((awardCategory) => ({
          value: awardCategory.key,
          label: awardCategory.name,
        }));

      let project = this.props.award?.project;
      if (project && typeof project === 'string') {
        project = projectOptions.find((opt) => opt.value === project) || null;
      }

      let awardCategory = this.props.award?.awardCategory;
      if (awardCategory && typeof awardCategory === 'string') {
        awardCategory =
          awardCategoryOptions.find((opt) => opt.value === awardCategory) || null;
      }

      this.setState({
        name: this.props.award?.name || '',
        project,
        awardCategory,
      });
    }
  }

  onChangeField = (e) => {
    this.setState({
      [e.target.name]: e.target.value,
    });
  };

  onChangeProject = (choice) => {
    this.setState({project: choice});
  };

  onChangeAwardCategory = (choice) => {
    this.setState({awardCategory: choice});
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
      this.setState({name: '', project: null, awardCategory: null});
    }
  };

  render() {
    let {award, projectList, awardCategoryList, usedAwardCategories = []} = this.props;
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

    // Hydrate project and awardCategory for Selects
    const selectedProject =
      typeof this.state.project === 'string'
        ? projectOptions.find((opt) => opt.value === this.state.project) || null
        : this.state.project;

    const selectedAwardCategory =
      typeof this.state.awardCategory === 'string'
        ? awardCategoryOptions.find((opt) => opt.value === this.state.awardCategory) ||
          null
        : this.state.awardCategory;

    // Filter awardCategoryOptions to only allow unused categories or the current selection
    const currentAwardCategoryValue =
      typeof this.state.awardCategory === 'string'
        ? this.state.awardCategory
        : this.state.awardCategory?.value;

    const filteredAwardCategoryOptions = awardCategoryOptions.filter(
      (opt) =>
        !usedAwardCategories.includes(opt.value) ||
        opt.value === currentAwardCategoryValue
    );

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
              styles={customStyles}
              name="category"
              value={selectedAwardCategory}
              options={filteredAwardCategoryOptions}
              onChange={this.onChangeAwardCategory}
            />
          </div>
          <div className="col-sm-5">
            <Select
              styles={customStyles}
              name="project"
              value={selectedProject}
              options={projectOptions}
              onChange={this.onChangeProject}
            />
          </div>
          <div className="col-sm-2">
            <button
              className="btn btn-primary btn-lg"
              disabled={!this.hasChanges()}
              onClick={() => this.props.onSave(this.state, this.onSuccess)}
            >
              <span className="glyphicon glyphicon-ok" />
            </button>
            {!!award && (
              <button
                className="btn btn-danger btn-lg"
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
          project: award.project?.value || null,
          awardCategory: award.awardCategory?.value || null,
        })
        .then(onSuccess)
        .catch((error) => {
          console.error(error);
        });
    } else {
      firebase
        .push(`/years/${year}/awards`, {
          name: award.name,
          project: award.project?.value || null,
          awardCategory: award.awardCategory?.value || null,
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

    const awards = mapObject(awardList);

    return (
      <div>
        {awards
          .sort((a, b) => ('' + a.name).localeCompare(b.name))
          .map((award, idx) => {
            // Collect used awardCategories, excluding this row's own selection
            const usedAwardCategories = awards
              .filter((a, i) => i !== idx)
              .map((a) => a.awardCategory)
              .filter(Boolean);

            // Filter awardCategoryList for this row
            const filteredAwardCategoryList = Object.fromEntries(
              awardCategoryList
                ? Object.entries(awardCategoryList).filter(
                    ([key, value]) =>
                      !usedAwardCategories.includes(value.key) ||
                      value.key === award.awardCategory
                  )
                : []
            );

            return (
              <AwardRow
                key={award.key}
                award={award}
                onSave={this.onSave}
                onDelete={this.onDelete}
                projectList={projectList}
                awardCategoryList={filteredAwardCategoryList}
                year={year}
              />
            );
          })}
        {/* Blank row for new award */}
        <AwardRow
          key="new"
          onSave={this.onSave}
          onDelete={this.onDelete}
          projectList={projectList}
          awardCategoryList={
            awardCategoryList
              ? Object.fromEntries(
                  Object.entries(awardCategoryList).filter(
                    ([key, value]) =>
                      !awards
                        .map((a) => a.awardCategory)
                        .filter(Boolean)
                        .includes(value.key)
                  )
                )
              : {}
          }
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
