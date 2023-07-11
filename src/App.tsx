import { useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';

import { Buffer } from 'buffer';
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { hexToBytes, bytesToHex } from '@noble/hashes/utils';

import * as utxolib from '@bitgo/utxo-lib';

function App() {
  const [count, setCount] = useState(0);

  const mnemonic128 =
    'lab become cluster gesture junior ribbon sunny favorite safe enforce sphere awful'; // bip39.generateMnemonic(wordlist, 128);
  const seed = bip39.mnemonicToSeedSync(mnemonic128);

  const seedHex = bytesToHex(seed);

  const masterKey = HDKey.fromMasterSeed(seed); // bip32 root key
  console.log(masterKey.toJSON());
  // console.log(masterKey.privateKey, masterKey.publicKey);

  const newKey = masterKey.derive("m/48'/0'/0'/0'/0"); // bip32 extended key for this derivation path
  const key = newKey.deriveChild(0);
  // approach A
  const node = utxolib.bip32.fromBase58(
    key.toJSON().xpriv,
    utxolib.networks.bitcoin,
  );
  const keyPair = utxolib.ECPair.fromPrivateKey(node.privateKey, {
    network: utxolib.networks.bitcoin,
    compressed: true,
  });
  // approach B
  // const keyPair = utxolib.ECPair.fromPrivateKey(
  //   Buffer.from(node.privateKey?.buffer),
  //   {
  //     network: utxolib.networks.bitcoin,
  //     compressed: true,
  //   },
  // );
  console.log(keyPair);
  console.log('Public Key: ', keyPair.publicKey.toString('hex'));
  console.log('Private Key: ', keyPair.toWIF());
  const { address: legacyAddress } = utxolib.payments.p2pkh({
    pubkey: keyPair.publicKey,
  });

  console.log('legacyAddress', legacyAddress);
  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      {mnemonic128}
      <br></br>
      {seedHex}
      <br></br>
      {masterKey.toJSON().xpriv}
      <br></br>
      {newKey.toJSON().xpriv}
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
