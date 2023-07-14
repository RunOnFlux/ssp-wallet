import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import secureLocalStorage from 'react-secure-storage';
import { useAppSelector } from '../../hooks';
import './Login.css';

import { generateMnemonic } from '../../lib/wallet';

type Entropy = 128 | 256;

function App() {
  // if no user, navigate to Welcome
  const navigate = useNavigate();
  useEffect(() => {
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/welcome');
      return;
    }
  });
  const [entropy, setEntropy] = useState<Entropy>(128);
  const [mnemonic, setMnemonic] = useState('');

  const generateMnemonicPhrase = (entValue: 128 | 256) => {
    const mnemonic = generateMnemonic(entValue);
    setMnemonic(mnemonic);
  };

  const xpriv = useAppSelector((state) => state.xpriv.value);

  return (
    <>
      <h1>Login</h1>
      <div className="card">
        <button
          onClick={() =>
            setEntropy((entropy) => {
              if (entropy === 128) {
                return 256;
              }
              return 128;
            })
          }
        >
          entropy is {entropy}
        </button>
        <button onClick={() => generateMnemonicPhrase(entropy)}>
          Generate Mnemonic Seed
        </button>
        <p>{mnemonic}</p>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      Master xpriv for Flux from Create:<br></br>
      {xpriv}
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
      <Link to={`/welcome`}>Navigate to Home</Link>
    </>
  );
}

export default App;
