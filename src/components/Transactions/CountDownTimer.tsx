import React from 'react';
import { CountdownCircleTimer } from 'react-countdown-circle-timer';

interface CountdownTimerProps {
  targetDateTime: string; // Date-time in ISO format (e.g., "2023-12-31T23:59:59")
  onFinish?:() => void;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ targetDateTime, onFinish, }) => {
  const endTime = new Date(targetDateTime).getTime();
  const now = Date.now();
  const remainingTimeInSeconds = Math.max((endTime - now) / 1000, 0);

  return (
    <CountdownCircleTimer
      isPlaying
      duration={remainingTimeInSeconds}
      colors="#218380"
      size={30}
      strokeWidth={3}
      onComplete={onFinish}
    >
      {({ remainingTime }) => {
        const minutes = Math.floor((remainingTime % 3600) / 60);
        const seconds = remainingTime % 60;
        return <span style={{fontSize: 8}}>{`${minutes}:${seconds}`}</span>;
      }}
    </CountdownCircleTimer>
  );
};

export default CountdownTimer;
