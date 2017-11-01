import React, { Component } from 'react';
import './App.css';

import {db} from './fire';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      projectList: []
    };
  }

  componentWillMount(){
    let projectsRef = db.collection('projects');
    projectsRef.orderBy('name').limit(100).get().then(querySnapshot => {
      this.setState({projectList: querySnapshot.docs.map(doc => {
        return {id: doc.id, ...doc.data()};
      })});
    });
    // projectsRef.onSnapshot(snapshot => {
    //   snapshot.docChanges.forEach(change => {
    //     this.setState({
    //       projectList: [doc].concat(this.state.projectList)
    //     });
    //   }
    // });
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <h1 className="App-title">#HACKWEEK</h1>
        </header>
        <div className="App-intro">
          <h3>Projects</h3>
          <ul>
          {this.state.projectList.map(project => {
            return <li key={project.id}>{project.name}</li>;
          })}
          </ul>
        </div>
      </div>
    );
  }
}

export default App;
