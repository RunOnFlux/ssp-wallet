import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../hooks';

import { setXpriv } from '../../store';

import './Create.css';

import { generateMnemonic, getMasterXpriv } from '../../lib/wallet';
import {
  encrypt as passworderEncrypt,
  decrypt as passworderDecrypt,
} from '@metamask/browser-passworder';

function App() {
  const navigate = useNavigate();
  // use secure local storage for storing mnemonic 'seed', 'xpriv-48-slip-0-0', 'xpub-48-slip-0-0' and '2-xpub-48-slip-0-0' (2- as for second key) of together with encryption of browser-passworder
  // use localforage to store addresses, balances, transactions and other data. This data is not encrypted for performance reasons and they are not sensitive.
  // if user exists, navigate to login
  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    setPassword('password');
  }, [password]);

  useEffect(() => {
    // generate seed
    const accPresent = localStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
  });

  const dispatch = useAppDispatch();

  const GenerateMnemonicPhrase = (entValue: 128 | 256) => {
    const mnemonic = generateMnemonic(entValue);
    setMnemonic(mnemonic);
  };

  const storeMnemonic = async () => {
    if (!password) {
      console.log('password is empty');
      return;
    }
    if (!mnemonic) {
      console.log('mnemonic is empty');
      return;
    }
    const xpriv = getMasterXpriv(mnemonic, 48, 19167, 0, 'p2sh');
    dispatch(setXpriv(xpriv));
    try {
      const blob = await passworderEncrypt(password, mnemonic);
      console.log(blob);
      const mnemonicDecrypted = await passworderDecrypt(password, blob);
      console.log(mnemonicDecrypted);
      return;
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <>
      <h1>Create</h1>
      <div className="card">
        12 words is very secure.
        <button onClick={() => GenerateMnemonicPhrase(128)}>
          Generate 12 word Mnemonic Seed
        </button>
        24 words is even more secure.
        <button onClick={() => GenerateMnemonicPhrase(256)}>
          Generate 24 word Mnemonic Seed
        </button>
        <p>{mnemonic}</p>
      </div>
      {mnemonic && (
        <div>
          <h2>Write down your mnemonic seed</h2>
          <p>
            In case you ever loose your password or access to your computer.
            That is the way to recover your funds.
          </p>

          <div>
            <h2>Create your wallet password</h2>
            <p>You will need to use password every time you open The Wallet</p>
            tbd input
          </div>
          <div>
            <button onClick={() => void storeMnemonic()}>Let's go!</button>
            button later does open popup for random words from mnemonic seed and
            for password confirmation. If both ok. Lets navigate to setup Link
            on mobile
          </div>
        </div>
      )}
      <Link to={`/login`}>Navigate to Login</Link>
    </>
  );
}

export default App;
