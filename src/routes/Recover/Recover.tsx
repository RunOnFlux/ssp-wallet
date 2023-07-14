import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch } from '../../hooks';

import { setXpriv } from '../../store';

import './Recover.css';

import { generateMnemonic, getMasterXpriv } from '../../lib/wallet';

type Entropy = 128 | 256;

function App() {
  // use secure local storage for storing mnemonic 'seed', 'xpriv-48-slip-0-0', 'xpub-48-slip-0-0' and '2-xpub-48-slip-0-0' (2- as for second key) of together with encryption of browser-passworder
  // use localforage to store addresses, balances, transactions and other data. This data is not encrypted for performance reasons and they are not sensitive.
  // if user exists, navigate to login
  const [entropy, setEntropy] = useState<Entropy>(128);
  const [mnemonic, setMnemonic] = useState('');

  const dispatch = useAppDispatch();

  const GenerateMnemonicPhrase = (entValue: 128 | 256) => {
    const mnemonic = generateMnemonic(entValue);
    setMnemonic(mnemonic);
    const xpriv = getMasterXpriv(mnemonic, 48, 19167, 0, 'p2sh');
    dispatch(setXpriv(xpriv));
  };

  return (
    <>
      <h1>Create</h1>
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
        <button onClick={() => GenerateMnemonicPhrase(entropy)}>
          Generate Mnemonic Seed
        </button>
        <p>{mnemonic}</p>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
      <Link to={`/login`}>Navigate to Login</Link>
    </>
  );
}

export default App;
