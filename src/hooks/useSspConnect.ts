import React from 'react';
import { SspConnectContext } from '../contexts/sspConnectContext';

export const useSspConnect = () => {
  const context = React.useContext(SspConnectContext);
  if (context === undefined) {
    throw new Error('useSspConnect must be used within a SspConnectContext');
  }
  return context;
};
