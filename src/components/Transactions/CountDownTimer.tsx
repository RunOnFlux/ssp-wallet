import React, { useState } from 'react';
import { ColorFormat, CountdownCircleTimer } from 'react-countdown-circle-timer';

interface CountdownTimerProps {
  targetDateTime: string; // Date-time in ISO format (e.g., "2023-12-31T23:59:59")
  onFinish?: () => void;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ targetDateTime, onFinish }) => {
  const [remainingTimeInSeconds, _] = useState(() => {
    const endTime = new Date(targetDateTime).getTime();
    const now = Date.now();
    return Math.max((endTime - now) / 1000, 0);
  });
  const [color, setColor] = useState('');

  const getColor = (remainingTimeInSeconds: number) => {
    if (remainingTimeInSeconds > 10 * 60) {
      return '#63A375';
    } else if (remainingTimeInSeconds > 5 * 60) {
      return '#F74D26';
    } else {
      return '#E03109';
    }
  };

  console.log(remainingTimeInSeconds);
  return (
    <div style={{ marginRight: -6 }}>
      <CountdownCircleTimer
        isPlaying
        duration={remainingTimeInSeconds}
        colors={color as ColorFormat}
        size={30}
        strokeWidth={3}
        onComplete={onFinish}
        onUpdate={r => setColor(getColor(r))}
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

export default CountdownTimer;