import React from 'react';
import PropTypes from 'prop-types';
import './styles.css';

const InfoSection = ({title, description, imageUrl, imageAlt, isReversed}) => {
  return (
    <section className={`info-section ${isReversed ? 'reversed' : ''}`}>
      <div className="info-content">
        <div className="info-text">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="info-image">
          <img src={imageUrl} alt={imageAlt} />
        </div>
      </div>
    </section>
  );
};

InfoSection.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  imageUrl: PropTypes.string.isRequired,
  imageAlt: PropTypes.string.isRequired,
  isReversed: PropTypes.bool,
};

InfoSection.defaultProps = {
  isReversed: false,
};

export default InfoSection;
