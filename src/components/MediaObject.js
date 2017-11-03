import React, {Component} from 'react';
import PropTypes from 'prop-types';

export default class MediaObject extends Component {
  static propTypes = {
    firebase: PropTypes.object.isRequired,
    media: PropTypes.object.isRequired,
    project: PropTypes.object.isRequired,
    projectKey: PropTypes.string.isRequired,
    canDelete: PropTypes.bool,
    onDelete: PropTypes.func,
  };

  constructor(...args) {
    super(...args);
    this.state = {loaded: false, deleting: false};
  }

  onDelete = e => {
    if (this.state.deleting) return;
    this.setState({deleting: true});
    let {firebase, media, project, projectKey} = this.props;
    let storageRef = firebase.storage().ref();
    storageRef
      .child(media.path)
      .delete()
      .then(() => {
        firebase
          .remove(`/years/${project.year}/projects/${projectKey}/media/${media.key}`)
          .then(() => {
            this.props.onDelete();
          });
      });
  };

  componentWillMount() {
    let {firebase, media} = this.props;
    let storageRef = firebase.storage().ref();
    storageRef
      .child(media.path)
      .getDownloadURL()
      .then(url => {
        this.setState({url, loaded: true});
      })
      .catch(ex => {
        console.error(ex);
      });
  }

  render() {
    if (!this.state.loaded) return <div className="Project-media-item loading" />;
    return (
      <div className="Project-media-item">
        <a href={this.state.url} target="hackweekMedia">
          <img src={this.state.url} alt={this.props.media.name} />
        </a>
        {this.props.canDelete && (
          <div className="btn-set" style={{textAlign: 'center', marginTop: 5}}>
            <a
              onClick={this.onDelete}
              className="btn btn-xs btn-danger"
              disabled={this.state.deleting}
            >
              Delete
            </a>
          </div>
        )}
      </div>
    );
  }
}
