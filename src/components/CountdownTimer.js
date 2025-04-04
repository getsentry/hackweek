import React, {Component} from 'react';
import moment from 'moment';
import confetti from 'canvas-confetti';

class CountdownTimer extends Component {
  state = {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    pulseSeconds: false,
    pulseMinutes: false,
    pulseHours: false,
    pulseDays: false,
  };

  componentDidMount() {
    this.interval = setInterval(this.updateCountdown, 1000);
    this.updateCountdown();
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  updateCountdown = () => {
    const hackweekStart = moment('2025-08-18');
    const now = moment();
    const duration = moment.duration(hackweekStart.diff(now));

    const newSeconds = duration.seconds();
    const newMinutes = duration.minutes();
    const newHours = duration.hours();
    const newDays = Math.floor(duration.asDays());

    // Trigger animations when values change
    if (newSeconds !== this.state.seconds) {
      this.setState({pulseSeconds: true});
      setTimeout(() => this.setState({pulseSeconds: false}), 1000);
    }
    if (newMinutes !== this.state.minutes) {
      this.setState({pulseMinutes: true});
      setTimeout(() => this.setState({pulseMinutes: false}), 1000);
      // Fire confetti when minutes change
      confetti({
        particleCount: 100,
        spread: 70,
        origin: {x: 0.5, y: 0.45},
        colors: ['#6c5fc7', '#584ac0', '#4a3da1', '#e0dce5'],
        ticks: 200,
        startVelocity: 30,
        gravity: 0.8,
        shapes: ['circle', 'square'],
        scalar: 0.75,
        zIndex: -1,
      });
    }
    if (newHours !== this.state.hours) {
      this.setState({pulseHours: true});
      setTimeout(() => this.setState({pulseHours: false}), 1000);
      // More intense confetti for hours
      const end = Date.now() + 500;
      const colors = ['#6c5fc7', '#584ac0', '#4a3da1', '#e0dce5'];

      (function frame() {
        confetti({
          particleCount: 150,
          spread: 90,
          origin: {x: 0.5, y: 0.45},
          colors: colors,
          ticks: 200,
          startVelocity: 45,
          gravity: 0.7,
          shapes: ['circle', 'square'],
          scalar: 1,
          zIndex: -1,
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      })();
    }
    if (newDays !== this.state.days) {
      this.setState({pulseDays: true});
      setTimeout(() => this.setState({pulseDays: false}), 1000);
      // Most intense confetti for days
      const end = Date.now() + 1000;
      const colors = ['#6c5fc7', '#584ac0', '#4a3da1', '#e0dce5'];

      (function frame() {
        confetti({
          particleCount: 200,
          angle: 60,
          spread: 100,
          origin: {x: 0.3, y: 0.45},
          colors: colors,
          zIndex: -1,
        });
        confetti({
          particleCount: 200,
          angle: 120,
          spread: 100,
          origin: {x: 0.7, y: 0.45},
          colors: colors,
          zIndex: -1,
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      })();
    }

    this.setState({
      days: newDays,
      hours: newHours,
      minutes: newMinutes,
      seconds: newSeconds,
    });
  };

  render() {
    const {
      days,
      hours,
      minutes,
      seconds,
      pulseSeconds,
      pulseMinutes,
      pulseHours,
      pulseDays,
    } = this.state;

    return (
      <div className="countdown-timer">
        <div className="countdown-values">
          <div className={`countdown-segment ${pulseDays ? 'pulse-days' : ''}`}>
            <span className="countdown-number">{days}</span>
            <span className="countdown-label">days</span>
          </div>
          <div className={`countdown-segment ${pulseHours ? 'pulse-hours' : ''}`}>
            <span className="countdown-number">{hours}</span>
            <span className="countdown-label">hours</span>
          </div>
          <div className={`countdown-segment ${pulseMinutes ? 'pulse-minutes' : ''}`}>
            <span className="countdown-number">{minutes}</span>
            <span className="countdown-label">minutes</span>
          </div>
          <div className={`countdown-segment ${pulseSeconds ? 'pulse-seconds' : ''}`}>
            <span className="countdown-number">{seconds}</span>
            <span className="countdown-label">seconds</span>
          </div>
        </div>
        <style jsx>{`
          .countdown-timer {
            text-align: center;
            margin-bottom: 24px;
            position: relative;
            z-index: 1;
          }

          .countdown-values {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
            position: relative;
            z-index: 2;
          }

          .countdown-segment {
            position: relative;
            z-index: 2;
            display: flex;
            flex-direction: column;
            align-items: center;
            background: #ffffff;
            padding: 20px;
            border-radius: 6px;
            width: 160px;
            border: 1px solid #e0dce5;
            box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #e0dce5;
          }

          .countdown-segment::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            background: radial-gradient(
              circle,
              rgba(108, 95, 199, 0.1) 0%,
              rgba(108, 95, 199, 0) 70%
            );
            border-radius: 50%;
            transform: translate(-50%, -50%);
            z-index: 0;
          }

          .countdown-segment.pulse-seconds::after {
            animation: pulseSeconds 1s ease-out;
          }

          .countdown-segment.pulse-minutes::after {
            animation: pulseMinutes 1s ease-out;
          }

          .countdown-segment.pulse-hours::after {
            animation: pulseHours 1s ease-out;
          }

          .countdown-segment.pulse-days::after {
            animation: pulseDays 1s ease-out;
          }

          @keyframes pulseSeconds {
            0% {
              width: 0;
              height: 0;
              opacity: 0.7;
            }
            100% {
              width: 200px;
              height: 200px;
              opacity: 0;
            }
          }

          @keyframes pulseMinutes {
            0% {
              width: 0;
              height: 0;
              opacity: 0.8;
            }
            100% {
              width: 250px;
              height: 250px;
              opacity: 0;
            }
          }

          @keyframes pulseHours {
            0% {
              width: 0;
              height: 0;
              opacity: 0.9;
            }
            100% {
              width: 300px;
              height: 300px;
              opacity: 0;
            }
          }

          @keyframes pulseDays {
            0% {
              width: 0;
              height: 0;
              opacity: 1;
            }
            100% {
              width: 350px;
              height: 350px;
              opacity: 0;
            }
          }

          .countdown-number {
            position: relative;
            z-index: 1;
            font-size: 64px;
            font-weight: bold;
            color: #2b2233;
            min-width: 100px;
            text-align: center;
          }

          .countdown-label {
            position: relative;
            z-index: 1;
            font-size: 16px;
            color: #666;
            text-transform: uppercase;
            margin-top: 5px;
          }

          @media (max-width: 768px) {
            .countdown-timer h1 {
              font-size: 32px;
              margin-bottom: 20px;
            }

            .countdown-timer h2 {
              font-size: 18px;
            }

            .countdown-values {
              gap: 12px;
            }

            .countdown-segment {
              padding: 12px;
              width: calc(50% - 18px);
              min-width: 120px;
            }

            .countdown-number {
              font-size: 36px;
              min-width: auto;
            }

            .countdown-label {
              font-size: 14px;
            }
          }

          @media (max-width: 480px) {
            .countdown-timer h1 {
              font-size: 28px;
            }

            .countdown-timer h2 {
              font-size: 16px;
            }

            .countdown-segment {
              width: calc(50% - 12px);
              padding: 10px;
            }

            .countdown-number {
              font-size: 32px;
            }

            .countdown-label {
              font-size: 12px;
            }
          }
        `}</style>
      </div>
    );
  }
}

export default CountdownTimer;
