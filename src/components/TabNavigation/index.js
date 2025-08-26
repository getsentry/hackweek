import React, {Component} from 'react';
import PropTypes from 'prop-types';
import ListLink from '../ListLink';
import './styles.css';

class TabNavigation extends Component {
  static propTypes = {
    tabs: PropTypes.arrayOf(
      PropTypes.shape({
        to: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        index: PropTypes.bool,
      })
    ).isRequired,
    className: PropTypes.string,
  };

  render() {
    const {tabs, className = ''} = this.props;

    return (
      <ul id="tab-navigation" className={`nav nav-tabs ${className}`}>
        {tabs.map((tab, idx) => (
          <ListLink
            key={idx}
            to={tab.to}
            index={tab.index || false}
            activeClassName="active"
          >
            {tab.label}
          </ListLink>
        ))}
      </ul>
    );
  }
}

export default TabNavigation;
