import utxolib from '@runonflux/utxo-lib';
import * as aaSchnorrMultisig from '@runonflux/aa-schnorr-multisig-sdk';
import { Buffer } from 'buffer';
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { toCashAddress } from 'bchaddrjs';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import {
  deriveMultisigAddress as deriveSolanaMultisigAddress,
  deriveVaultAddress as deriveSolanaVaultAddress,
} from '@runonflux/solana-multisig';
import {
  keyPair,
  minHDKey,
  multisig,
  xPrivXpub,
  cryptos,
  externalIdentity,
  publicPrivateNonce,
} from '../types';
import { blockchains } from '@storage/blockchains';

function getSolanaProgramId(chain: keyof cryptos): PublicKey {
  const id = blockchains[chain].programId;
  if (!id) {
    throw new Error(`Chain ${chain} has no programId in spec`);
  }
  return new PublicKey(id);
}

export function getLibId(chain: keyof cryptos): string {
  return blockchains[chain].libid;
}

export function getScriptType(type: string): number {
  switch (type) {
    case 'p2sh':
      return 0;
    case 'p2sh-p2wsh':
      return 1;
    case 'p2wsh':
      return 2;
    default:
      return 0;
  }
}

function generatexPubxPriv(
  mnemonic: string,
  bip = 48,
  coin: number,
  account = 0,
  type = 'p2sh',
  chain: keyof cryptos,
): xPrivXpub {
  const scriptType = getScriptType(type);

  let seed = bip39.mnemonicToSeedSync(mnemonic);
  // @ts-expect-error assign to null as it is no longer needed
  mnemonic = null;
  const bipParams = blockchains[chain].bip32;
  const masterKey = HDKey.fromMasterSeed(seed, bipParams);
  seed = new Uint8Array();
  const externalChain = masterKey.derive(
    `m/${bip}'/${coin}'/${account}'/${scriptType}'`,
  );
  return externalChain.toJSON();
}

// generate random mnemonic provided strength
export function generateMnemonic(strength: 128 | 256 = 256): string {
  return bip39.generateMnemonic(wordlist, strength);
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic, wordlist);
}

// returns xpub of hardened derivation path for a particular coin
export function getMasterXpub(
  mnemonic: string,
  bip = 48,
  coin: number,
  account = 0,
  type = 'p2sh',
  chain: keyof cryptos,
): string {
  const xPubxPriv = generatexPubxPriv(
    mnemonic,
    bip,
    coin,
    account,
    type,
    chain,
  );
  // @ts-expect-error assign to null as it is no longer needed
  mnemonic = null;
  return xPubxPriv.xpub;
}

// returns xpriv of hardened derivation path for a particular coin
export function getMasterXpriv(
  mnemonic: string,
  bip = 48,
  coin: number,
  account = 0,
  type = 'p2sh',
  chain: keyof cryptos,
): string {
  const xPubxPriv = generatexPubxPriv(
    mnemonic,
    bip,
    coin,
    account,
    type,
    chain,
  );
  // @ts-expect-error assign to null as it is no longer needed
  mnemonic = null;
  return xPubxPriv.xpriv;
}

// given xpubs of two parties, generate multisig address and its redeem script
export function generateMultisigAddress(
  xpub1: string,
  xpub2: string,
  typeIndex: 0 | 1 | 10, // normal, change, internal identity
  addressIndex: number,
  chain: keyof cryptos,
): multisig {
  if (blockchains[chain].chainType === 'evm') {
    return generateMultisigAddressEVM(
      xpub1,
      xpub2,
      typeIndex,
      addressIndex,
      chain,
    );
  }
  if (blockchains[chain].chainType === 'sol') {
    // For Solana, xpub1/xpub2 are JSON-stringified arrays of 20 base58
    // Ed25519 leaf pubkeys. Look up the pubkey for the requested index
    // and derive the vault PDA via the multisig SDK.
    let walletPubkeys: string[];
    let keyPubkeys: string[];
    try {
      walletPubkeys = JSON.parse(xpub1) as string[];
      keyPubkeys = JSON.parse(xpub2) as string[];
    } catch {
      throw new Error(
        'generateMultisigAddress: sol xpub fields are not JSON arrays',
      );
    }
    if (
      !Array.isArray(walletPubkeys) ||
      !Array.isArray(keyPubkeys) ||
      walletPubkeys.length !== 20 ||
      keyPubkeys.length !== 20
    ) {
      throw new Error('generateMultisigAddress: sol pubkey arrays malformed');
    }
    // typeIndex doesn't apply to Solana (no change/identity distinction at
    // the address-derivation level — multisig IS the identity). Index into
    // the pubkey array using addressIndex; treat identity (typeIndex=10) as
    // index 0.
    const idx = typeIndex === 10 ? 0 : addressIndex;
    if (idx < 0 || idx >= 20) {
      throw new Error(
        `generateMultisigAddress: sol address index ${idx} out of range`,
      );
    }
    return generateMultisigAddressSOL(
      walletPubkeys[idx],
      keyPubkeys[idx],
      0, // vaultIndex — SSP uses single vault per multisig
      chain,
    );
  }
  const libID = getLibId(chain);
  const network = utxolib.networks[libID];
  const bipParams = blockchains[chain].bip32;
  const type = blockchains[chain].scriptType;
  const networkBipParams = utxolib.networks[libID].bip32;
  const cashAddrPrefix = blockchains[chain].cashaddr;
  let externalChain1, externalChain2;
  try {
    externalChain1 = HDKey.fromExtendedKey(xpub1, bipParams);
  } catch (e) {
    console.log(e);
    externalChain1 = HDKey.fromExtendedKey(xpub1, networkBipParams);
  }
  try {
    externalChain2 = HDKey.fromExtendedKey(xpub2, bipParams);
  } catch (e) {
    console.log(e);
    externalChain2 = HDKey.fromExtendedKey(xpub2, networkBipParams);
  }

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
  const publicKeysBuffer: Buffer[] = sortedPublicKeys.map((hex: string) =>
    Buffer.from(hex, 'hex'),
  );

  if (type === 'p2wsh') {
    const witnessScript = utxolib.script.multisig.output.encode(
      2,
      publicKeysBuffer,
    );
    const scriptPubKey = utxolib.script.witnessScriptHash.output.encode(
      utxolib.crypto.sha256(witnessScript),
    );
    let address = utxolib.address.fromOutputScript(scriptPubKey, network);
    if (cashAddrPrefix) {
      address = toCashAddress(address);
    }
    const witnessScriptHex: string = Buffer.from(witnessScript).toString('hex');
    return {
      address,
      witnessScript: witnessScriptHex,
    };
  } else if (type === 'p2sh-p2wsh') {
    const witnessScript = utxolib.script.multisig.output.encode(
      2,
      publicKeysBuffer,
    );
    const redeemScript = utxolib.script.witnessScriptHash.output.encode(
      utxolib.crypto.sha256(witnessScript),
    );
    const scriptPubKey = utxolib.script.scriptHash.output.encode(
      utxolib.crypto.hash160(redeemScript),
    );
    let address = utxolib.address.fromOutputScript(scriptPubKey, network);
    const witnessScriptHex: string = Buffer.from(witnessScript).toString('hex');
    const redeemScriptHex: string = Buffer.from(redeemScript).toString('hex');
    if (cashAddrPrefix) {
      address = toCashAddress(address);
    }
    return {
      address,
      redeemScript: redeemScriptHex,
      witnessScript: witnessScriptHex,
    };
  } else {
    // p2sh
    const redeemScript: Uint8Array = utxolib.script.multisig.output.encode(
      2,
      publicKeysBuffer,
    );
    const scriptPubKey = utxolib.script.scriptHash.output.encode(
      utxolib.crypto.hash160(redeemScript),
    );

    let address: string = utxolib.address.fromOutputScript(
      scriptPubKey,
      network,
    );

    if (cashAddrPrefix) {
      address = toCashAddress(address);
    }

    const redeemScriptHex: string = Buffer.from(redeemScript).toString('hex');
    return {
      address,
      redeemScript: redeemScriptHex,
    };
  }
}

export function deriveEVMPublicKey(
  xpub2: string,
  typeIndex: number, // 0: normal, 1: change, 10: identity, or vaultIndex for enterprise
  addressIndex: number,
  chain: keyof cryptos,
): string {
  const bipParams = blockchains[chain].bip32;
  const externalChain2 = HDKey.fromExtendedKey(xpub2, bipParams);

  const externalAddress2: HDKey = externalChain2
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const publicKey2 = externalAddress2.publicKey;
  const pubKeyBuffer2 = Buffer.from(publicKey2!);

  return pubKeyBuffer2.toString('hex');
}

// given xpubs of two parties, generate multisig address. EVM chains
export function generateMultisigAddressEVM(
  xpub1: string,
  xpub2: string,
  typeIndex: 0 | 1 | 10, // normal, change, internal identity
  addressIndex: number,
  chain: keyof cryptos,
): multisig {
  const bipParams = blockchains[chain].bip32;
  const { accountSalt, factorySalt, factoryAddress, entrypointAddress } =
    blockchains[chain];
  const externalChain1 = HDKey.fromExtendedKey(xpub1, bipParams);
  const externalChain2 = HDKey.fromExtendedKey(xpub2, bipParams);

  const externalAddress1 = externalChain1
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);
  const externalAddress2: HDKey = externalChain2
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  // Uint8Array(32)
  const publicKey1 = externalAddress1.publicKey;
  const publicKey2 = externalAddress2.publicKey;

  const pubKeyBuffer1 = Buffer.from(publicKey1!);
  const pubKeyBuffer2 = Buffer.from(publicKey2!);

  const keyPubKey1 = new aaSchnorrMultisig.types.Key(pubKeyBuffer1);
  const keyPubKey2 = new aaSchnorrMultisig.types.Key(pubKeyBuffer2);

  const publicKeys = [keyPubKey1, keyPubKey2];

  const combinedAddresses =
    aaSchnorrMultisig.helpers.SchnorrHelpers.getAllCombinedAddrFromKeys(
      publicKeys,
      publicKeys.length,
    );

  const accountImplementationAddress =
    aaSchnorrMultisig.helpers.create2Helpers.predictAccountImplementationAddrOffchain(
      factorySalt,
      factoryAddress,
      entrypointAddress,
    );

  const address =
    aaSchnorrMultisig.helpers.create2Helpers.predictAccountAddrOffchain(
      factoryAddress,
      accountImplementationAddress,
      combinedAddresses,
      accountSalt,
    );

  return {
    address,
  };
}

// given xpriv of our party, generate keypair consisting of privateKey in and public key belonging to it
export function generateAddressKeypairEVM(
  xpriv: string,
  typeIndex: number, // 0: normal, 1: change, 10: identity, or vaultIndex for enterprise
  addressIndex: number,
  chain: keyof cryptos,
): keyPair {
  const bipParams = blockchains[chain].bip32;
  const externalChain = HDKey.fromExtendedKey(xpriv, bipParams);

  const externalAddress = externalChain
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const publicKey = Buffer.from(externalAddress.publicKey!).toString('hex');
  const privateKey =
    '0x' + Buffer.from(externalAddress.privateKey!).toString('hex');

  return { privKey: privateKey, pubKey: publicKey };
}

/**
 * Solana key derivation: BIP32 leaf private key bytes are used as the
 * Ed25519 seed (per nacl.sign.keyPair.fromSeed). This keeps the entire HD
 * tree unified under BIP32 — Ed25519 only enters at the leaf, so the same
 * `m/48'/coin'/account'/scriptType'/typeIndex/addressIndex` path works
 * across all chains.
 *
 * Returns:
 *   privKey — 64-byte Ed25519 secret key (seed + public, hex)
 *   pubKey  — 32-byte Ed25519 public key, base58-encoded (Solana convention)
 */
export function generateAddressKeypairSOL(
  xpriv: string,
  typeIndex: number,
  addressIndex: number,
  chain: keyof cryptos,
): keyPair {
  const bipParams = blockchains[chain].bip32;
  const externalChain = HDKey.fromExtendedKey(xpriv, bipParams);

  const externalAddress = externalChain
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  if (!externalAddress.privateKey) {
    throw new Error(
      `generateAddressKeypairSOL: no private key derivable for ${chain}`,
    );
  }

  const ed25519Pair = nacl.sign.keyPair.fromSeed(externalAddress.privateKey);
  const pubKeyBase58 = bs58.encode(ed25519Pair.publicKey);
  const privKeyHex = Buffer.from(ed25519Pair.secretKey).toString('hex');

  return { privKey: privKeyHex, pubKey: pubKeyBase58 };
}

/**
 * Pre-derive an array of 20 leaf Ed25519 public keys (base58-encoded) for
 * a Solana chain. This is what gets exchanged via pairing — once at setup,
 * both wallet and key send each other their 20-pubkey arrays so each side
 * can compute multisig vault addresses for any address index 0-19.
 *
 * 20 matches the wallet-count UI cap (Navbar.tsx).
 *
 * ⚠️  CHANGING THIS LIMIT — the value is mirrored in several places that
 *    must stay in lockstep:
 *      - this loop bound
 *      - generateMultisigAddress sol length check + index bound (this file)
 *      - Key.tsx isSolanaPubkeyArrayString length check + QR errorLevel
 *      - Navbar.tsx max-wallet guard
 *      - TokenBoxImport.tsx activated-tokens cleanup loop
 *      - ssp-key wallet.ts (mirror functions)
 *      - ssp-key Home.tsx isSolanaPubkeyArrayString
 *      - ssp-key AddressDetails picker length
 *      - ssp-relay syncApi.ts validation (length === 20)
 *      - ssp-relay-enterprise lib/config.ts portfolio.addressDerivationCount
 *
 *    QR coupling: the sync QR carries `${chain}:${JSON-array}`. Key.tsx
 *    picks errorLevel Q for short payloads and M for long ones (>200
 *    chars) — at the fixed 256px display size, M keeps Solana's ~951-char
 *    payload's cells large enough for a phone camera to resolve. v40 QR
 *    capacity at M is ~2331 bytes — fits up to ~50 pubkeys. Past that you'd
 *    drop to L (~2953 bytes / ~64 pubkeys) and beyond that, split into
 *    multiple QR codes.
 */
export function generateSolanaPubkeyArray(
  xpriv: string,
  chain: keyof cryptos,
  typeIndex: number,
): string[] {
  // typeIndex selects the BIP32 child slot under which we derive the 20
  // ed25519 leaves. Consumer wallet passes 0 (receiving). Enterprise
  // vaults pass `vault.vaultIndex` so each vault in an org gets a distinct
  // pubkey pool — mirrors EVM/UTXO per-vault key separation. Both sides
  // (wallet + key) must pass the same typeIndex or the multisig PDA built
  // from the resulting pubkey arrays won't match what each device signs.
  const pubkeys: string[] = [];
  for (let i = 0; i < 20; i++) {
    const { pubKey } = generateAddressKeypairSOL(xpriv, typeIndex, i, chain);
    pubkeys.push(pubKey);
  }
  return pubkeys;
}

/**
 * Compute the deposit address (vault PDA) for a 2-of-2 SSP multisig on
 * Solana, given both members' Ed25519 public keys.
 *
 * Solana addresses cannot be derived from a partner's xpub alone (Ed25519
 * has no non-hardened public-key derivation), so this function takes the
 * actual leaf Ed25519 pubkeys of both members. Pairing exchanges these
 * once at setup time (see Phase 3 — pairing payload extension).
 */
export function generateMultisigAddressSOL(
  myEd25519PubkeyBase58: string,
  partnerEd25519PubkeyBase58: string,
  vaultIndex: number,
  chain: keyof cryptos,
): multisig {
  const programId = getSolanaProgramId(chain);
  const members = [
    new PublicKey(myEd25519PubkeyBase58),
    new PublicKey(partnerEd25519PubkeyBase58),
  ];
  const threshold = 2; // SSP is always 2-of-2 (wallet + key)
  const [multisigPda] = deriveSolanaMultisigAddress(
    members,
    threshold,
    programId,
  );
  const [vaultPda] = deriveSolanaVaultAddress(
    multisigPda,
    vaultIndex,
    programId,
  );
  return {
    address: vaultPda.toBase58(),
  };
}

// given xpriv of our party, generate keypair consisting of privateKey in WIF format and public key belonging to it
export function generateAddressKeypair(
  xpriv: string,
  typeIndex: number, // 0: normal, 1: change, 10: identity, or vaultIndex for enterprise
  addressIndex: number,
  chain: keyof cryptos,
): keyPair {
  const { chainType } = blockchains[chain];
  if (chainType === 'evm') {
    return generateAddressKeypairEVM(xpriv, typeIndex, addressIndex, chain);
  }
  if (chainType === 'sol') {
    return generateAddressKeypairSOL(xpriv, typeIndex, addressIndex, chain);
  }
  const libID = getLibId(chain);
  const bipParams = blockchains[chain].bip32;
  const networkBipParams = utxolib.networks[libID].bip32;
  let externalChain;
  let network = utxolib.networks[libID];
  try {
    externalChain = HDKey.fromExtendedKey(xpriv, bipParams);
    network = Object.assign({}, network, {
      bip32: bipParams,
    });
  } catch (e) {
    console.log(e);
    externalChain = HDKey.fromExtendedKey(xpriv, networkBipParams);
  }

  const externalAddress = externalChain
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const derivedExternalAddress: minHDKey = utxolib.HDNode.fromBase58(
    // to get priv key in wif via lib
    externalAddress.toJSON().xpriv,
    network,
  );

  const privateKeyWIF: string = derivedExternalAddress.keyPair.toWIF();

  const publicKey = derivedExternalAddress.keyPair
    .getPublicKeyBuffer()
    .toString('hex'); // same as Buffer.from(externalAddress.pubKey).toString('hex);. Library does not expose keypair from just hex of private key, workaround

  return { privKey: privateKeyWIF, pubKey: publicKey };
}

// given xpub of our party, generate address of identity of xpub. INTERNAL SSP
export function generateInternalIdentityAddress(
  xpub: string,
  chain: keyof cryptos,
): string {
  const typeIndex = 10; // identity index
  const addressIndex = 0; // identity index

  const libID = getLibId(chain);
  const bipParams = blockchains[chain].bip32;
  const networkBipParams = utxolib.networks[libID].bip32;
  let externalChain;
  try {
    externalChain = HDKey.fromExtendedKey(xpub, bipParams);
  } catch (e) {
    console.log(e);
    externalChain = HDKey.fromExtendedKey(xpub, networkBipParams);
  }

  const externalAddress = externalChain
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const publicKey = externalAddress.publicKey;
  const pubKeyBuffer = Buffer.from(publicKey!);

  const network = utxolib.networks[libID];

  const genKeypair = utxolib.ECPair.fromPublicKeyBuffer(pubKeyBuffer, network);
  const address = genKeypair.getAddress();

  return address;
}

// given xpub of our party, generate address of identity of xpub. EXTERNAL PUBLIC SSP WALLET ID. Uses identity slip for xpub derivation path
export function generateExternalIdentityAddress(xpub: string): string {
  const chain = 'btc' as keyof cryptos;
  const typeIndex = 11; // identity index
  const addressIndex = 0; // identity index

  const libID = getLibId(chain);
  const bipParams = blockchains[chain].bip32;
  const networkBipParams = utxolib.networks[libID].bip32;
  let externalChain;
  try {
    externalChain = HDKey.fromExtendedKey(xpub, bipParams);
  } catch (e) {
    console.log(e);
    externalChain = HDKey.fromExtendedKey(xpub, networkBipParams);
  }

  const externalAddress = externalChain
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const publicKey = externalAddress.publicKey;
  const pubKeyBuffer = Buffer.from(publicKey!);

  const network = utxolib.networks[libID];

  const genKeypair = utxolib.ECPair.fromPublicKeyBuffer(pubKeyBuffer, network);
  const address = genKeypair.getAddress();

  return address;
}

// given xpriv of our party, generate keypair consisting of privateKey in WIF format and public key belonging to it for Node Identity.. Comprossed
export function generateNodeIdentityKeypair(
  xpriv: string,
  typeIndex: 11 | 12,
  addressIndex: number,
  chain: keyof cryptos,
): keyPair {
  const libID = getLibId(chain);
  const bipParams = blockchains[chain].bip32;
  const networkBipParams = utxolib.networks[libID].bip32;
  let externalChain;
  let network = utxolib.networks[libID];
  try {
    externalChain = HDKey.fromExtendedKey(xpriv, bipParams);
    network = Object.assign({}, network, {
      bip32: bipParams,
    });
  } catch (e) {
    console.log(e);
    externalChain = HDKey.fromExtendedKey(xpriv, networkBipParams);
  }

  const externalAddress = externalChain
    .deriveChild(typeIndex)
    .deriveChild(addressIndex);

  const derivedExternalAddress: minHDKey = utxolib.HDNode.fromBase58(
    externalAddress.toJSON().xpriv,
    network,
  );

  const privateKeyWIF: string = derivedExternalAddress.keyPair.toWIF();

  const publicKey = derivedExternalAddress.keyPair
    .getPublicKeyBuffer()
    .toString('hex');

  return { privKey: privateKeyWIF, pubKey: publicKey };
}

// given xpub of our party, generate keypair for our SSP Wallet Identity - this is a p2pkh bitcoin address used by thrid parties. SspId (same as FluxID)
export function generateExternalIdentityKeypair( // in memory we store just address
  xpriv: string,
): externalIdentity {
  const chain = 'btc' as keyof cryptos;
  const typeIndex = 11; // identity index
  const addressIndex = 0; // identity index
  const identityKeypair = generateNodeIdentityKeypair(
    xpriv,
    typeIndex,
    addressIndex,
    chain,
  );

  const pubKeyBuffer = Buffer.from(identityKeypair.pubKey, 'hex');
  const libID = getLibId(chain);
  const network = utxolib.networks[libID];

  const genKeypair = utxolib.ECPair.fromPublicKeyBuffer(pubKeyBuffer, network);
  const address = genKeypair.getAddress();

  const externalIdentity = {
    privKey: identityKeypair.privKey,
    pubKey: identityKeypair.pubKey,
    address,
  };
  return externalIdentity;
}

// from private key in wif format, get private key in hex format
export function wifToPrivateKey(
  privateKey: string,
  chain: keyof cryptos,
): string {
  const libID = getLibId(chain);
  const network = utxolib.networks[libID];
  const keyPair = utxolib.ECPair.fromWIF(privateKey, network);
  const pk = keyPair.getPrivateKeyBuffer().toString('hex');
  return pk;
}

/**
 * Generate a public-private nonce pair for EVM Schnorr multi-party signing.
 */
export function generatePublicNonce(): publicPrivateNonce {
  const publicNonce = aaSchnorrMultisig.core._generateNonce();
  return {
    k: publicNonce.k.toString('hex'),
    kTwo: publicNonce.kTwo.toString('hex'),
    kPublic: publicNonce.kPublic.toString('hex'),
    kTwoPublic: publicNonce.kTwoPublic.toString('hex'),
  };
}
