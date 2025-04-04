import React, {useState, useEffect} from 'react';
import PropTypes from 'prop-types';
import './styles.css';

const calculateTimeLeft = () => {
  const hackweekDate = new Date('2025-08-18T00:00:00');
  const difference = hackweekDate - new Date();

  if (difference > 0) {
    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((difference / 1000 / 60) % 60);
    const seconds = Math.floor((difference / 1000) % 60);

    return {days, hours, minutes, seconds};
  }

  return {days: 0, hours: 0, minutes: 0, seconds: 0};
};

const CountdownTimer = ({variant = 'default'}) => {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (variant === 'text') {
    return (
      <div className="countdown-text">
        {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
      </div>
    );
  }

  return (
    <div className="countdown-container">
      <div className="countdown-timer">
        <div className="countdown-item">
          <div className="countdown-value">{timeLeft.days}</div>
          <div className="countdown-label">Days</div>
        </div>
        <div className="countdown-item">
          <div className="countdown-value">{timeLeft.hours}</div>
          <div className="countdown-label">Hours</div>
        </div>
        <div className="countdown-item">
          <div className="countdown-value">{timeLeft.minutes}</div>
          <div className="countdown-label">Minutes</div>
        </div>
        <div className="countdown-item">
          <div className="countdown-value">{timeLeft.seconds}</div>
          <div className="countdown-label">Seconds</div>
        </div>
      </div>
    </div>
  );
};

CountdownTimer.propTypes = {
  variant: PropTypes.oneOf(['default', 'text']),
};

export default CountdownTimer;
