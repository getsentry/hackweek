import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import Dropzone from 'react-dropzone';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';
import * as Sentry from '@sentry/react';

import './ProjectList.css';

import {currentYear} from '../config';
import Layout from '../components/Layout';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import MediaObject from '../components/MediaObject';
import {humanizeBytes} from '../utils';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
class EditProject extends Component {
  static propTypes = {
    auth: PropTypes.object,
    userList: PropTypes.object,
    project: PropTypes.object,
    groupsList: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  constructor(...args) {
    super(...args);
    this.state = {loaded: false, pendingUploads: [], saving: false};
  }

  componentWillReceiveProps({auth, location, project, groupsList, userList}) {
    if (project === null) {
      this.context.router.push('/');
    }
    const isClaim = 'claim' in location.query;
    if (
      isLoaded(project) &&
      isLoaded(groupsList) &&
      isLoaded(userList) &&
      !this.state.loaded
    ) {
      this.setState({
        loaded: true,
        name: project.name,
        summary: project.summary,
        group: project.group,
        repository: project.repository,
        needHelp: project.needHelp || false,
        needHelpComments: project.needHelpComments || '',
        isIdea: (!isClaim && project.isIdea) || false,
        team:
          isClaim && project.isIdea
            ? [
                {
                  value: auth.uid,
                  label: auth.displayName,
                },
              ]
            : Object.keys(project.members || {}).map((memberKey) => ({
                value: memberKey,
                label: userList[memberKey].displayName,
              })),
        media: Object.keys(project.media || {}).map((mediaKey) => ({
          ...project.media[mediaKey],
          key: mediaKey,
        })),
      });
    }
  }

  getProjectUrl() {
    let {params} = this.props;
    return `/years/${params.year || currentYear}/projects/${params.projectKey}`;
  }

  onSubmit = (e) => {
    e.preventDefault();
    if (this.state.saving) return null;
    this.setState({saving: true});

    let {firebase, params, project} = this.props;

    firebase
      .update(`/years/${params.year || currentYear}/projects/${params.projectKey}`, {
        name: this.state.name,
        group: this.state.group,
        summary: this.state.summary,
        repository: this.state.repository || '',
        isIdea: this.state.isIdea,
        needHelp: !this.state.isIdea && this.state.needHelp,
        needHelpComments: this.state.needHelpComments,
      })
      .then((snapshot) => {
        let updates = {};

        let currentMembers = new Set(Object.keys(project.members || {}));
        let remainingMembers = new Set(currentMembers);
        // first get the team in order
        (this.state.isIdea ? [] : this.state.team).forEach(({value}) => {
          if (!currentMembers.has(value)) {
            updates[
              `/years/${params.year || currentYear}/projects/${
                params.projectKey
              }/members/${value}`
            ] = {
              ts: Date.now(),
            };
          } else {
            remainingMembers.delete(value);
          }
        });
        remainingMembers.forEach((memberKey) => {
          let path = `/years/${params.year || currentYear}/projects/${
            params.projectKey
          }/members/${memberKey}`;
          updates[path] = null;
        });

        if (this.state.pendingUploads.length !== 0) {
          let filesReadyToUpload = [];
          this.state.pendingUploads.forEach((upload) => {
            let fileRef = firebase
              .database()
              .ref()
              .child(
                `/years/${params.year || currentYear}/projects/${params.projectKey}/media`
              );
            let fileKey = fileRef.push().key;
            updates[
              `/years/${params.year || currentYear}/projects/${
                params.projectKey
              }/media/${fileKey}`
            ] = {
              path: `projects/${params.projectKey}/media/${fileKey}/${upload.name}`,
              name: upload.name,
              ts: Date.now(),
            };
            filesReadyToUpload.push([upload, fileKey]);
          });

          let storageRef = firebase.storage().ref();
          Promise.all(
            filesReadyToUpload.map(([upload, fileKey]) => {
              let fileRef = storageRef.child(
                `projects/${params.projectKey}/media/${fileKey}/${upload.name}`
              );
              return fileRef.put(upload, {
                project: params.projectKey,
              });
            })
          )
            .then(() => {
              firebase
                .database()
                .ref()
                .update(updates)
                .then(() => {
                  this.context.router.push(this.getProjectUrl());
                })
                .catch((ex) => {
                  console.error(ex);
                  this.setState({saving: false});
                  Sentry.captureException(ex);
                });
            })
            .catch((ex) => {
              console.error(ex);
              this.setState({saving: false});
              Sentry.captureException(ex);
            });
        } else {
          firebase
            .database()
            .ref()
            .update(updates)
            .then(() => {
              this.context.router.push(this.getProjectUrl());
            })
            .catch((ex) => {
              console.error(ex);
              this.setState({saving: false});
              Sentry.captureException(ex);
            });
        }
      })
      .catch((ex) => {
        console.error(ex);
        this.setState({saving: false});
        Sentry.captureException(ex);
      });
  };

  onAddMedia = (files) => {
    this.setState({pendingUploads: files.concat(this.state.pendingUploads)});
  };

  onRemoveMedia = (media) => {
    this.setState((state) => ({
      media: state.media.filter((m) => m.key !== media.key),
    }));
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
    this.setState({group: group.value});
  };

  render() {
    let {firebase, params, project, userList, groupsList} = this.props;
    if (!this.state.loaded) return <div className="loading-indocator">Loading...</div>;
    if (project === null) return <Layout />;

    let teamOptions = mapObject(userList, (user, userKey) => ({
      value: userKey,
      label: user.displayName,
    }));

    let groupOptions = mapObject(groupsList, (group, groupKey) => ({
      value: groupKey,
      label: group.name,
    }));

    const isClaim = 'claim' in (this.props.location?.query || {});

    return (
      <Layout>
        <PageHeader title={isClaim ? 'Claim project' : 'Edit'} />
        {/* <h2>{isClaim ? 'Claim Project' : 'Edit Project'}</h2> */}
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
          {!this.state.isIdea && (
            <div className="form-group">
              <label>Repository</label>
              <input
                className="form-control"
                type="text"
                name="repository"
                value={this.state.repository}
                onChange={this.onChangeField}
              />
            </div>
          )}
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
              {!!this.state.media.length && (
                <div>
                  <h3>Media</h3>
                  <div className="Project-media">
                    {this.state.media.map((media) => (
                      <MediaObject
                        key={media.key}
                        firebase={firebase}
                        media={media}
                        project={project}
                        projectKey={params.projectKey}
                        onDelete={this.onRemoveMedia.bind(this, media)}
                        canDelete={true}
                      />
                    ))}
                  </div>
                </div>
              )}
              {!!this.state.pendingUploads.length && (
                <div>
                  <h3>Pending Uploads</h3>
                  <ul>
                    {this.state.pendingUploads.map((upload) => {
                      return (
                        <li key={upload.name}>
                          {upload.name} - {humanizeBytes(upload.size)}
                        </li>
                      );
                    })}
                  </ul>
                  <p>Once you hit save, give it a minute as uploads are slow!</p>
                </div>
              )}

              <div className="dropzone">
                <h3>Add Media</h3>
                <Dropzone onDrop={this.onAddMedia}>
                  <p style={{padding: 10}}>
                    Drop your media here, or click to select files to upload.
                  </p>
                </Dropzone>
              </div>
            </React.Fragment>
          )}

          <div className="btn-set" style={{textAlign: 'right'}}>
            <Button
              priority="tertiary"
              type="button"
              size="sm"
              onClick={() => this.context.router.goBack()}
            >
              nevermind
            </Button>
            <Button size="sm" kind="primary" disabled={this.state.saving}>
              {isClaim ? 'Claim project' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Layout>
    );
  }
}

export default compose(
  firebaseConnect((props) => [
    {
      path: `/users`,
      queryParams: ['orderByValue=displayName'],
      populates: [],
      storeAs: 'userList',
    },
    {
      path: `/years/${props.params.year || currentYear}/projects/${
        props.params.projectKey
      }`,
      populates: [],
      storeAs: 'project',
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
    project: orderedPopulatedDataToJS(firebase, 'project'),
    userList: orderedPopulatedDataToJS(firebase, 'userList'),
    groupsList: orderedPopulatedDataToJS(firebase, 'groupsList'),
  }))
)(EditProject);
