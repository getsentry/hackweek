import React, {useState, useEffect} from 'react';
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

const MicroCountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return <span className="micro-countdown">{timeLeft.days} days away</span>;
};

export default MicroCountdownTimer;
