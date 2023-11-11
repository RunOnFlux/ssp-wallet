import React, { useState } from 'react';
import { ColorFormat, CountdownCircleTimer } from 'react-countdown-circle-timer';

interface CountdownTimerProps {
  createdAtDateTime: string; // Date-time in ISO format (e.g., "2021-01-01T00:00:00")
  expireAtDateTime: string; // Date-time in ISO format (e.g., "2023-12-31T23:59:59")
  onFinish?: () => void;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ createdAtDateTime, expireAtDateTime, onFinish }) => {
  const [remainingTimeInSeconds] = useState(() => {
    const endTime = new Date(expireAtDateTime).getTime();
    const now = Date.now();
    return Math.max((endTime - now) / 1000, 0);
  });
  const [color, setColor] = useState('');

  const totalTime = (new Date(expireAtDateTime).getTime() - new Date(createdAtDateTime).getTime()) / 1000;

  const getColor = (remainingTimeInSeconds: number) => {
    if (remainingTimeInSeconds > 12 * 60) {
      return '#2B61D1'; // blue
    } else if (remainingTimeInSeconds > 8 * 60) {
      return '#63A375'; // green
    } else if (remainingTimeInSeconds > 4 * 60) {
      return '#F5A905'; // yellow
    } else {
      return '#E03109'; // red
    }
  };

  return (
    <div style={{ marginRight: -6 }}>
      <CountdownCircleTimer
        isPlaying
        duration={totalTime}
        initialRemainingTime={remainingTimeInSeconds}
        colors={color as ColorFormat}
        size={30}
        strokeWidth={3}
        onComplete={onFinish}
        onUpdate={(remainingTime: number) => setColor(getColor(remainingTime))}
      >
        {({ remainingTime }) => {
          const minutes = Math.floor((remainingTime % 3600) / 60);
          const seconds = remainingTime % 60;
          return <span style={{ fontSize: 8 }}>{`${minutes}:${seconds}`}</span>;
        }}
      </CountdownCircleTimer>
    </div>
  );
};

CountdownTimer.defaultProps = {
  onFinish: () => {
    console.log('CountdownTimer finished');
  },
};

export default CountdownTimer;