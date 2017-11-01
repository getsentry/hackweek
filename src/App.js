import React, {Component} from 'react';
import './App.css';

import LoginRequired from './Login';
import ProjectList from './ProjectList';

class App extends Component {
  render() {
    return (
      <div className="App">
        <header className="App-header">
          <h1 className="App-title">#HACKWEEK</h1>
        </header>
        <div className="App-intro">
          <LoginRequired>
            <ProjectList {...this.props} />
          </LoginRequired>
        </div>
      </div>
    );
  }
}

export default App;
