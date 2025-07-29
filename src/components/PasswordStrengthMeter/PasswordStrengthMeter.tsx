import React from 'react';

interface PasswordStrengthMeterProps {
  password: string;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password = '',
}) => {
  const calculateStrength = (): { score: number; color: string } => {
    if (!password) return { score: 0, color: '#d9d9d9' };

    let score = 0;

    // Length bonus
    if (password.length >= 8) score += 25;
    if (password.length >= 12) score += 15;

    // Character variety bonus
    if (/[a-z]/.test(password)) score += 15;
    if (/[A-Z]/.test(password)) score += 15;
    if (/[0-9]/.test(password)) score += 15;
    if (/[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/.test(password)) score += 15;

    // Determine color based on strength
    if (score < 25) {
      return { score: Math.min(score, 100), color: '#ff4d4f' };
    } else if (score < 60) {
      return { score: Math.min(score, 100), color: '#faad14' };
    } else if (score < 85) {
      return { score: Math.min(score, 100), color: '#52c41a' };
    } else {
      return { score: Math.min(score, 100), color: '#389e0d' };
    }
  };

  const { score, color } = calculateStrength();

  if (!password) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '4px',
        left: '32px',
        right: '32px',
        height: '2px',
        backgroundColor: 'rgba(0, 0, 0, 0.06)',
        borderRadius: '1px',
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${score}%`,
          backgroundColor: color,
          borderRadius: '1px',
          transition: 'all 0.3s ease',
        }}
      />
    </div>
  );
};

export default PasswordStrengthMeter;
