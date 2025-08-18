import React from 'react';
import CountdownTimer from '../CountdownTimer';
import './styles.css';

const HeroSection = () => {
  const getNextFriday9amPT = () => {
    const now = new Date();
    const laNow = new Date(
      now.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'})
    );
    const laTarget = new Date(laNow.getTime());
    const laDay = laNow.getDay();
    const daysUntilFriday = (5 - laDay + 7) % 7;
    laTarget.setDate(laNow.getDate() + daysUntilFriday);
    laTarget.setHours(9, 0, 0, 0);
    if (
      daysUntilFriday === 0 &&
      (laNow.getHours() > 9 ||
        (laNow.getHours() === 9 &&
          (laNow.getMinutes() > 0 ||
            laNow.getSeconds() > 0 ||
            laNow.getMilliseconds() > 0)))
    ) {
      laTarget.setDate(laTarget.getDate() + 7);
    }
    const offsetDeltaMs = now.getTime() - laNow.getTime();
    const targetInstantMs = laTarget.getTime() + offsetDeltaMs;
    return new Date(targetInstantMs);
  };
  return (
    <section className="hero-section">
      <div className="hero-content">
        <h1>Hackweek 2025</h1>
        <CountdownTimer targetDate={getNextFriday9amPT()} />
        <p className="hero-subtitle">until the hacking begins</p>
      </div>
    </section>
  );
};

export default HeroSection;
