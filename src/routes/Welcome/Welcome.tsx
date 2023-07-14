import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import secureLocalStorage from 'react-secure-storage';
import './Welcome.css';

function App() {
  const navigate = useNavigate();
  useEffect(() => {
    // if user exists, navigate to login
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
  });

  return (
    <>
      <h2>Welcome to</h2>
      <h1>THE Wallet</h1>
      <Link to={`/create`}>Create THE Wallet</Link>
      <Link to={`/create`}>Recover existing THE Wallet</Link>
    </>
  );
}

export default App;
