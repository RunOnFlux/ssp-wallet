import { useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';

import { Buffer } from 'buffer';
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';

import { bytesToHex } from '@noble/hashes/utils';

import utxolib from 'utxo-lib';

import { generateAddress } from './lib/wallet';

function App() {
  const [count, setCount] = useState(0);
  console.log(utxolib);

  // 2of2 account following bip48
  // https://github.com/thetrunk/bips/blob/master/bip-0048.mediawiki
  const mnemonicA =
    'lab become cluster gesture junior ribbon sunny favorite safe enforce sphere awful';
  const mnemonicB =
    'artist owner stool thought emerge fiber kind rib vague arrest ozone verb'; // bip39.generateMnemonic(wordlist, 128);

  const seedA = bip39.mnemonicToSeedSync(mnemonicA);
  const seedB = bip39.mnemonicToSeedSync(mnemonicB);

  const seedHexA = bytesToHex(seedA);
  const seedHexB = bytesToHex(seedB);

  const masterKeyA = HDKey.fromMasterSeed(seedA); // bip32 root key
  const masterKeyB = HDKey.fromMasterSeed(seedB); // bip32 root key

  // Flux is 19167
  // p2sh is script type of 0' as per https://github.com/bitcoin/bips/pull/1473/files
  const externalChainA = masterKeyA.derive("m/48'/19167'/0'/0'/0"); // bip32 extended key for this derivation path
  const externalChainB = masterKeyB.derive("m/48'/19167'/0'/0'/0"); // bip32 extended key for this derivation path
  // in wallet-key scenario we ONLY know the xpub part of PARTICULAR coin. Each coin has to be resynced manually
  const fluxExternalChainfromKEY = masterKeyB.derive("m/48'/19167'/0'/0'");
  const publicExternalChainForFluxFromKEY =
    fluxExternalChainfromKEY.toJSON().xpub;
  const externalChainBB = HDKey.fromExtendedKey(
    publicExternalChainForFluxFromKEY,
  ); // bip32 root key. fluxExternalChainfromKEY.toJSON().xpub is what KEY gives to WALLET
  console.log(externalChainBB); // constains only PUBLIC part

  const externalAddressA = externalChainA.deriveChild(0);
  const externalAddressB = externalChainB.deriveChild(0);
  console.log(externalAddressB);
  // wallet-key scenario
  const externalAddressBB = externalChainBB.deriveChild(0).deriveChild(0);
  console.log(externalAddressBB);

  const addresss = generateAddress(
    masterKeyA.derive("m/48'/19167'/0'/0'").toJSON().xpub,
    fluxExternalChainfromKEY.toJSON().xpub,
    0,
    0,
    'flux',
  );
  console.log(addresss);

  interface minHDKey {
    keyPair: {
      toWIF: () => string;
      getPublicKeyBuffer: () => Buffer;
    };
  }

  const bitgoExternalAddressA: minHDKey = utxolib.HDNode.fromBase58(
    externalAddressA.toJSON().xpriv,
    utxolib.networks.flux,
  );
  const bitgoExternalAddressB: minHDKey = utxolib.HDNode.fromBase58(
    externalAddressB.toJSON().xpriv,
    utxolib.networks.flux,
  );

  const privateKeyA: string = bitgoExternalAddressA.keyPair.toWIF();
  const privateKeyB: string = bitgoExternalAddressB.keyPair.toWIF();

  const publicKeyA = bitgoExternalAddressA.keyPair
    .getPublicKeyBuffer()
    .toString('hex');
  const publicKeyB = bitgoExternalAddressB.keyPair
    .getPublicKeyBuffer()
    .toString('hex');
  const publicKeyBB = Buffer.from(externalAddressBB.publicKey!).toString('hex');

  const sortedPublicKeys = [publicKeyA, publicKeyBB].sort();
  console.log(sortedPublicKeys);
  const publicKeysBuffer = sortedPublicKeys.map((hex: string) =>
    Buffer.from(hex, 'hex'),
  );

  const redeemScript = utxolib.script.multisig.output.encode(
    2,
    publicKeysBuffer,
  );
  const redeemScriptHex: string = Buffer.from(redeemScript).toString('hex');
  const scriptPubKey = utxolib.script.scriptHash.output.encode(
    utxolib.crypto.hash160(redeemScript),
  );

  const network = utxolib.networks.flux;
  const address: string = utxolib.address.fromOutputScript(
    scriptPubKey,
    network,
  );
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
      {mnemonicA}
      <br></br>
      {mnemonicB}
      <br></br>
      {seedHexA}
      <br></br>
      {seedHexB}
      <br></br>
      {masterKeyA.toJSON().xpriv}
      <br></br>
      {masterKeyB.toJSON().xpriv}
      <br></br>
      {externalChainA.toJSON().xpriv}
      <br></br>
      {externalChainB.toJSON().xpriv}
      <br></br>
      {publicKeyA}
      <br></br>
      {publicKeyB}
      <br></br>
      {publicKeyBB}
      <br></br>
      {privateKeyA}
      <br></br>
      {privateKeyB}
      <br></br>
      {redeemScriptHex}
      <br></br>
      {address}
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
