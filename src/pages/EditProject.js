import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import Dropzone from 'react-dropzone';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';
import Select from 'react-select';

import './ProjectList.css';

import {currentYear} from '../config';
import Layout from '../components/Layout';
import {mapObject, orderedPopulatedDataToJS} from '../helpers';
import MediaObject from '../components/MediaObject';

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
    this.state = {loaded: false, pendingUploads: [], saving: false};
  }

  componentWillReceiveProps({project, userList}) {
    if (project === null) {
      this.context.router.push('/');
    }
    if (isLoaded(project) && isLoaded(userList) && !this.state.loaded) {
      this.setState({
        loaded: true,
        name: project.name,
        summary: project.summary,
        needHelp: project.needHelp || false,
        team: Object.keys(project.members || {}).map(memberKey => ({
          value: memberKey,
          label: userList[memberKey].displayName,
        })),
        media: Object.keys(project.media || {}).map(mediaKey => ({
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

  onSubmit = e => {
    e.preventDefault();
    if (this.state.saving) return null;
    this.setState({saving: true});

    let {firebase, params, project} = this.props;

    firebase
      .update(`/years/${params.year || currentYear}/projects/${params.projectKey}`, {
        name: this.state.name,
        summary: this.state.summary,
        needHelp: this.state.needHelp,
      })
      .then(snapshot => {
        let updates = {};

        // first get the team in order
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

        let filesReadyToUpload = [];
        this.state.pendingUploads.forEach(upload => {
          let fileRef = firebase
            .database()
            .ref()
            .child(
              `/years/${params.year || currentYear}/projects/${params.projectKey}/media`
            );
          let fileKey = fileRef.push().key;
          updates[
            `/years/${params.year ||
              currentYear}/projects/${params.projectKey}/media/${fileKey}`
          ] = {
            path: `projects/${params.projectKey}/media/${fileKey}/${upload.name}`,
            name: upload.name,
            ts: new Date().getTime(),
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
              .catch(ex => {
                console.error(ex);
                this.setState({saving: false});
              });
          })
          .catch(ex => {
            console.error(ex);
            this.setState({saving: false});
          });
      })
      .catch(ex => {
        console.error(ex);
        this.setState({saving: false});
      });
  };

  onAddMedia = files => {
    this.setState({pendingUploads: files.concat(this.state.pendingUploads)});
  };

  onRemoveMedia = media => {
    console.log(this.state.media.filter(m => m.key !== media.key));
    this.setState(state => ({
      media: state.media.filter(m => m.key !== media.key),
    }));
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
    let {firebase, params, project, userList} = this.props;
    if (!this.state.loaded) return <div className="loading-indocator">Loading...</div>;
    if (project === null) return <Layout />;

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
              rows={6}
              required
            />
          </div>
          <div className="checkbox">
            <label>
              <input
                type="checkbox"
                name="needHelp"
                checked={this.state.needHelp}
                onChange={e => {
                  this.setState({needHelp: e.target.checked});
                }}
              />{' '}
              I'm looking for help on this project!
            </label>
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
          {!!this.state.media.length && (
            <div>
              <h3>Media</h3>
              <div className="Project-media">
                {this.state.media.map(media => (
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
                {this.state.pendingUploads.map(upload => {
                  return (
                    <li key={upload.name}>
                      {upload.name} - {upload.size} bytes
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="dropzone">
            <h3>Add Media</h3>
            <Dropzone onDrop={this.onAddMedia} accept="image/png, image/jpeg, image/gif">
              <p style={{padding: 10}}>
                Drop your media here, or click to select files to upload.
              </p>
            </Dropzone>
          </div>

          <div className="btn-set" style={{textAlign: 'right'}}>
            <Link
              to={this.getProjectUrl()}
              className="btn btn-default"
              disabled={this.state.saving}
            >
              Cancel
            </Link>
            <button className="btn btn-primary" disabled={this.state.saving}>
              Save Changes
            </button>
          </div>
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
