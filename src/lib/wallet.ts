import utxolib from 'utxo-lib';
import { Buffer } from 'buffer';
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { keyPair, minHDKey, multisig, xPrivXpub, cryptos } from '../types';

function generatexPubxPriv(
  mnemonic: string,
  bip = 48,
  coin: number,
  account = 0,
  type = 'p2sh',
): xPrivXpub {
  let scriptType = 0;

  switch (
    type // p2sh is script type of 0' as per
  ) {
    case 'p2sh':
      scriptType = 0;
      break;
    case 'p2sh-p2wsh':
      scriptType = 0;
      break;
    case 'p2wsh':
      scriptType = 2;
      break;
    default:
      scriptType = 0;
      break;
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const masterKey = HDKey.fromMasterSeed(seed);
  const externalChain = masterKey.derive(
    `m/${bip}'/${coin}'/${account}'/${scriptType}'`,
  );
  return externalChain.toJSON();
}

// generate random mnemonic provided strength
export function generateMnemonic(strength: 128 | 256 = 256): string {
  return bip39.generateMnemonic(wordlist, strength);
}

// returns xpub of hardened derivation path for a particular coin
export function getMasterXpub(
  mnemonic: string,
  bip = 48,
  coin: number,
  account = 0,
  type = 'p2sh',
): string {
  const xPubxPriv = generatexPubxPriv(mnemonic, bip, coin, account, type);
  return xPubxPriv.xpub;
}

// returns xpriv of hardened derivation path for a particular coin
export function getMasterXpriv(
  mnemonic: string,
  bip = 48,
  coin: number,
  account = 0,
  type = 'p2sh',
): string {
  const xPubxPriv = generatexPubxPriv(mnemonic, bip, coin, account, type);
  return xPubxPriv.xpriv;
}

// given xpubs of two parties, generate multisig address and its redeem script
export function generateMultisigAddress(
  xpub1: string,
  xpub2: string,
  typeIndex: 0 | 1 | 10,
  addressIndex: number,
  chain: keyof cryptos,
): multisig {
  const externalChain1 = HDKey.fromExtendedKey(xpub1);
  const externalChain2 = HDKey.fromExtendedKey(xpub2);

  const externalAddress1 = externalChain1
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);
  const externalAddress2: HDKey = externalChain2
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const publicKey1 = externalAddress1.publicKey;
  const publicKey2 = externalAddress2.publicKey;
  const pubKeyBuffer1 = Buffer.from(publicKey1!).toString('hex');
  const pubKeyBuffer2 = Buffer.from(publicKey2!).toString('hex');

  const sortedPublicKeys: string[] = [pubKeyBuffer1, pubKeyBuffer2].sort();
  console.log(sortedPublicKeys);
  const publicKeysBuffer: Buffer[] = sortedPublicKeys.map((hex: string) =>
    Buffer.from(hex, 'hex'),
  );

  const redeemScript: Uint8Array = utxolib.script.multisig.output.encode(
    2,
    publicKeysBuffer,
  );
  const scriptPubKey = utxolib.script.scriptHash.output.encode(
    utxolib.crypto.hash160(redeemScript),
  );

  const network = utxolib.networks[chain];
  const address: string = utxolib.address.fromOutputScript(
    scriptPubKey,
    network,
  );

  const redeemScriptHex: string = Buffer.from(redeemScript).toString('hex');
  return {
    address,
    redeemScript: redeemScriptHex,
  };
}

// given xpriv of our party, generate keypair consisting of privateKey in WIF format and public key belonging to it
export function generateAddressKeypair(
  xpriv: string,
  typeIndex: 0 | 1,
  addressIndex: number,
  chain: keyof cryptos,
): keyPair {
  const externalChain = HDKey.fromExtendedKey(xpriv);

  const externalAddress = externalChain
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const derivedExternalAddress: minHDKey = utxolib.HDNode.fromBase58(
    externalAddress.toJSON().xpriv,
    utxolib.networks[chain],
  );

  const privateKeyWIF: string = derivedExternalAddress.keyPair.toWIF();

  const publicKey = derivedExternalAddress.keyPair
    .getPublicKeyBuffer()
    .toString('hex');

  return { privKey: privateKeyWIF, pubKey: publicKey };
}

// given xpub of our party, generate address of identity of xpub.
export function generateIdentityAddress(xpub: string, chain: keyof cryptos): string {
  const typeIndex = 10; // identity index
  const addressIndex = 0; // identity index

  const externalChain = HDKey.fromExtendedKey(xpub);

  const externalAddress = externalChain
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const publicKey = externalAddress.publicKey;
  const pubKeyBuffer = Buffer.from(publicKey!);

  const network = utxolib.networks[chain];

  const genKeypair = utxolib.ECPair.fromPublicKeyBuffer(pubKeyBuffer, network);
  const address = genKeypair.getAddress();

  return address;
}
