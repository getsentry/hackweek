import React from 'react';
import CountdownTimer from '../CountdownTimer';
import './styles.css';

const HeroSection = () => {
  return (
    <section className="hero-section">
      <div className="hero-content">
        <h1>Hackweek 2025</h1>
        <CountdownTimer />
        <p className="hero-subtitle">until the hacking begins</p>
      </div>
    </section>
  );
};

export default HeroSection;
