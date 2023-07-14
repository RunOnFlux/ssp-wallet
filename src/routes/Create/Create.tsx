import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch } from '../../hooks';

import { setXpriv } from '../../store';

import './Create.css';

import { generateMnemonic, getMasterXpriv } from '../../lib/wallet';

type Entropy = 128 | 256;

function App() {
  const [entropy, setEntropy] = useState<Entropy>(128);
  const [mnemonic, setMnemonic] = useState('');

  const dispatch = useAppDispatch();

  function GenerateMnemonicPhrase(entValue: 128 | 256) {
    const mnemonic = generateMnemonic(entValue);
    setMnemonic(mnemonic);
    const xpriv = getMasterXpriv(mnemonic, 48, 19167, 0, 'p2sh');
    dispatch(setXpriv(xpriv));
  }

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
