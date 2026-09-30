// @ts-nocheck test suite
/**
 * TRON keys, signers and vault addresses — reproduces EVERY vector in
 * ~/repos/tron-ssp-vectors.json (TRON_SSP_CONTRACT.md §2). SSP Key, the relay
 * and the enterprise backend reproduce the same vectors; a failure here means
 * cross-device signing would break.
 *
 * The vectors pin a fixed test factory/implementation (the SDK's labels, not a
 * deployment) through an explicit NetworkConfig, so `getNetwork('mainnet')` is
 * mocked to return that config. `nile` stays the real pinned table (factory
 * null) to exercise the not-live path.
 */
import { describe, it, expect, vi } from 'vitest';
import vectors from '../fixtures/tron-ssp-vectors.json';

vi.mock('@runonflux/tron-multisig', async (importOriginal) => {
  const actual = await importOriginal();
  const vectorNet = actual.getNetwork({
    ...actual.NETWORKS.mainnet,
    name: 'ssp-vectors',
    factory: 'THEmkXNjoxz6zj7wDBtXRd1DCYeLTvRYSB',
    implementation: 'TJEfVHrNkFfPdyNVFmY8cvJPm77rDQfSn3',
  });
  return {
    ...actual,
    getNetwork: (n) => (n === 'mainnet' ? vectorNet : actual.getNetwork(n)),
  };
});

import * as T from '@runonflux/tron-multisig';
import {
  getMasterXpub,
  getMasterXpriv,
  generateMultisigAddress,
  generateAddressKeypair,
  generateInternalIdentityAddress,
  generateNodeIdentityKeypair,
  wifToPrivateKey,
} from '../../src/lib/wallet';
import {
  isChainAvailable,
  isTronChain,
  isTronLive,
  isValidTronAddress,
  tronConsumerConfig,
  tronConsumerVault,
  tronLeafAddress,
  tronLeafPublicKey,
  tronNetwork,
  tronNetworkName,
} from '../../src/lib/tron';
import {
  addressFromScannedQr,
  isValidSolAddress,
  validateReceiverAddress,
} from '../../src/lib/addressValidation';
import { validateSolRecipient } from '../../src/lib/sendStrategies/sol';
import { explorerTxUrl, explorerAddressUrl } from '../../src/lib/explorerUrl';
import { blockchains, isTestnetChain } from '../../src/storage/blockchains';
import { backends } from '../../src/storage/backends';

const chain = 'tron';
const W =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const Kk =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const S3 =
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';
const Z = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

const accountXpub = (mnemonic: string, account: number) =>
  getMasterXpub(mnemonic, 48, 195, account, 'p2sh', chain);

describe('TRON chain identity (contract §1)', () => {
  it('matches the contract table for tron', () => {
    const c = blockchains.tron;
    expect(c.id).toBe('tron');
    expect(c.chainType).toBe('tron');
    expect(c.libid).toBe('tron');
    expect(c.name).toBe('TRON');
    expect(c.symbol).toBe('TRX');
    expect(c.decimals).toBe(6);
    expect(c.slip).toBe(195);
    expect(c.scriptType).toBe('p2sh');
    expect(c.bip32).toEqual({ public: 0x0488b21e, private: 0x0488ade4 });
    expect(c.backend).toBe('trongrid');
    expect(c.node).toBe('node-tron.sspwallet.io');
    expect(c.api).toBe('api-tron.sspwallet.io');
    expect(backends().tron.explorer).toBe('tronscan.org');
    // mainnet: an onramp exists (walletChromeContract symbol rule)
    expect(c.onramperNetwork).toBeTruthy();
    expect(isTestnetChain('tron')).toBe(false);
  });

  it('matches the contract table for tronNile', () => {
    const c = blockchains.tronNile;
    expect(c.id).toBe('tronNile');
    expect(c.chainType).toBe('tron');
    expect(c.libid).toBe('tronNile');
    expect(c.name).toBe('TRON Nile');
    expect(c.symbol).toBe('TEST-TRX');
    expect(c.decimals).toBe(6);
    expect(c.slip).toBe(1);
    expect(isTestnetChain('tronNile')).toBe(true);
    expect(c.backend).toBe('trongrid');
    expect(c.node).toBe('node-tronnile.sspwallet.io');
    expect(c.api).toBe('api-tronnile.sspwallet.io');
    expect(backends().tronNile.explorer).toBe('nile.tronscan.org');
    // a testnet without onramp carries TEST in its symbol
    expect(c.onramperNetwork).toBeUndefined();
    expect(c.symbol).toContain('TEST');
  });

  it('maps chains to SDK networks', () => {
    expect(tronNetworkName('tron')).toBe('mainnet');
    expect(tronNetworkName('tronNile')).toBe('nile');
    expect(() => tronNetworkName('eth')).toThrow();
    expect(isTronChain('tron')).toBe(true);
    expect(isTronChain('solMainnet')).toBe(false);
    expect(tronNetwork('tronNile').chainId).toBe(3448148188n);
  });

  it('whitelists USDT first, with the SDK USDT contract and 6 decimals', () => {
    const [native, usdt] = blockchains.tron.tokens;
    expect(native).toMatchObject({ contract: '', symbol: 'TRX', decimals: 6 });
    expect(usdt).toMatchObject({
      contract: T.NETWORKS.mainnet.usdt,
      symbol: 'USDT',
      decimals: 6,
    });
    for (const tk of blockchains.tron.tokens.slice(1)) {
      expect(isValidTronAddress(tk.contract)).toBe(true);
    }
    expect(blockchains.tronNile.tokens[1].contract).toBe(T.NETWORKS.nile.usdt);
    expect(blockchains.tronNile.tokens[1].symbol).toContain('TEST');
  });
});

describe('TRON consumer 2-of-2 vectors (contract §2)', () => {
  const { walletXpub, keyXpub, leaves } = vectors.consumer;

  it("derives the account xpubs at m/48'/195'/0'/0'", () => {
    expect(accountXpub(W, 0)).toBe(walletXpub);
    expect(accountXpub(Kk, 0)).toBe(keyXpub);
  });

  for (const [path, leaf] of Object.entries(leaves)) {
    const [typeIndex, addressIndex] = path.split('-').map(Number);

    it(`leaf ${path}: signers, config hash and vault address`, () => {
      expect(tronLeafAddress(walletXpub, typeIndex, addressIndex, chain)).toBe(
        leaf.walletSigner,
      );
      expect(tronLeafAddress(keyXpub, typeIndex, addressIndex, chain)).toBe(
        leaf.keySigner,
      );
      const config = tronConsumerConfig(
        walletXpub,
        keyXpub,
        typeIndex,
        addressIndex,
        chain,
      );
      expect(config).toEqual({
        signers: leaf.signers,
        threshold: leaf.threshold,
      });
      const vault = tronConsumerVault(
        walletXpub,
        keyXpub,
        typeIndex,
        addressIndex,
        chain,
      );
      expect(T.to0x(vault.configHash)).toBe(leaf.configHash);
      expect(vault.address).toBe(leaf.address);
    });

    it(`leaf ${path}: generateMultisigAddress (wallet.ts) → vault, any xpub order`, () => {
      const a = generateMultisigAddress(
        walletXpub,
        keyXpub,
        typeIndex,
        addressIndex,
        chain,
      );
      expect(a).toEqual({ address: leaf.address });
      const b = generateMultisigAddress(
        keyXpub,
        walletXpub,
        typeIndex,
        addressIndex,
        chain,
      );
      expect(b.address).toBe(leaf.address);
    });

    it(`leaf ${path}: generateAddressKeypair is the wallet signer`, () => {
      const xpriv = getMasterXpriv(W, 48, 195, 0, 'p2sh', chain);
      const kp = generateAddressKeypair(xpriv, typeIndex, addressIndex, chain);
      expect(kp.privKey).toMatch(/^[0-9a-f]{64}$/);
      expect(kp.pubKey).toMatch(/^0[23][0-9a-f]{64}$/);
      expect(T.addressFromPublicKey(T.hexToBytes(kp.pubKey))).toBe(
        leaf.walletSigner,
      );
      expect(T.localSigner(T.hexToBytes(kp.privKey)).address).toBe(
        leaf.walletSigner,
      );
    });
  }

  it('the vault address is the pure SDK prediction (never re-implemented)', () => {
    const leaf = leaves['0-0'];
    const predicted = T.predictVaultAddress(
      tronNetwork(chain),
      T.configHash(leaf.signers, leaf.threshold),
    );
    expect(predicted).toBe(leaf.address);
  });

  it('never lowercases a vault address (base58 is case-sensitive)', () => {
    const { address } = generateMultisigAddress(
      walletXpub,
      keyXpub,
      0,
      0,
      chain,
    );
    expect(address).not.toBe(address.toLowerCase());
    expect(isValidTronAddress(address.toLowerCase())).toBe(false);
  });
});

describe('TRON enterprise vectors (org 100, contract §2)', () => {
  it('single-device 2-of-3', () => {
    const v = vectors.enterpriseSingle2of3;
    const xpubs = [W, Kk, S3].map((m) => accountXpub(m, v.orgIndex));
    expect(xpubs).toEqual(v.signerXpubs);
    const config = T.buildEnterpriseConfig(
      xpubs.map((x) =>
        tronLeafPublicKey(x, v.vaultIndex, v.addressIndex, chain),
      ),
      v.threshold,
    );
    expect(config.signers).toEqual(v.signers);
    const vault = T.deriveVault(tronNetwork(chain), config);
    expect(T.to0x(vault.configHash)).toBe(v.configHash);
    expect(vault.address).toBe(v.address);
  });

  it('dual 2-of-2 (wallet + key leaf per member, threshold 4)', () => {
    const v = vectors.enterpriseDual2of2;
    const pubs = [W, Kk, S3, Z].map((m) =>
      tronLeafPublicKey(
        accountXpub(m, v.orgIndex),
        v.vaultIndex,
        v.addressIndex,
        chain,
      ),
    );
    const config = T.buildEnterpriseConfig(pubs, v.requiredSigners * 2);
    expect(config.threshold).toBe(v.threshold);
    expect(config.signers).toEqual(v.signers);
    const vault = T.deriveVault(tronNetwork(chain), config);
    expect(T.to0x(vault.configHash)).toBe(v.configHash);
    expect(vault.address).toBe(v.address);
  });
});

describe('TRON not live (factory / sponsor unpinned)', () => {
  it('isTronLive is false while any deployment constant is null', () => {
    // mainnet here has factory + implementation but no sponsor/feeCollector
    expect(isTronLive('tron')).toBe(false);
    expect(isTronLive('mainnet')).toBe(false);
    // nile is the real pinned table: all null
    expect(isTronLive('tronNile')).toBe(false);
    expect(isTronLive('nile')).toBe(false);
    expect(isTronLive('btc')).toBe(false);
    expect(isChainAvailable('tron')).toBe(false);
    expect(isChainAvailable('btc')).toBe(true);
    expect(isChainAvailable('solMainnet')).toBe(true);
  });

  it('address derivation throws NOT_DEPLOYED instead of guessing', () => {
    const { walletXpub, keyXpub } = vectors.consumer;
    expect(() =>
      generateMultisigAddress(walletXpub, keyXpub, 0, 0, 'tronNile'),
    ).toThrow(/not deployed/i);
    try {
      generateMultisigAddress(walletXpub, keyXpub, 0, 0, 'tronNile');
    } catch (e) {
      expect(T.isTronMultisigError(e, 'NOT_DEPLOYED')).toBe(true);
    }
  });
});

describe('TRON never reaches the utxolib identity / WIF helpers', () => {
  const xpriv = getMasterXpriv(W, 48, 195, 0, 'p2sh', chain);
  it.each([
    [
      'generateInternalIdentityAddress',
      () => generateInternalIdentityAddress(vectors.consumer.walletXpub, chain),
    ],
    [
      'generateNodeIdentityKeypair',
      () => generateNodeIdentityKeypair(xpriv, 12, 0, chain),
    ],
    ['wifToPrivateKey', () => wifToPrivateKey('L1', chain)],
  ])('%s refuses TRON', (_name, fn) => {
    expect(fn).toThrow(/not supported for TRON/);
  });
});

describe('TRON address validation (contract §1)', () => {
  const tronAddr = vectors.consumer.leaves['0-0'].address;
  const solAddr = '7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy';

  it('accepts a strict base58check TRON address on tron', () => {
    expect(validateReceiverAddress(tronAddr, 'tron')).toEqual({ valid: true });
    expect(validateReceiverAddress(` ${tronAddr} `, 'tronNile')).toEqual({
      valid: true,
    });
  });

  it('rejects a broken checksum and a lowercased address', () => {
    const broken = tronAddr.slice(0, -1) + (tronAddr.endsWith('a') ? 'b' : 'a');
    expect(validateReceiverAddress(broken, 'tron').valid).toBe(false);
    expect(validateReceiverAddress(tronAddr.toLowerCase(), 'tron').valid).toBe(
      false,
    );
  });

  it('TRON vs Solana: decided by decoded length, not the base58 regex', () => {
    // the TRON address matches the Solana regex …
    expect(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tronAddr)).toBe(true);
    // … but decodes to 25 bytes, so it is never a Solana recipient
    expect(isValidSolAddress(tronAddr)).toBe(false);
    expect(validateSolRecipient(tronAddr)).toBe(false);
    expect(validateReceiverAddress(tronAddr, 'solMainnet')).toEqual({
      valid: false,
      warningChainType: 'tron',
    });
    // and a Solana key is not a TRON address
    expect(validateReceiverAddress(solAddr, 'tron')).toEqual({
      valid: false,
      warningChainType: 'sol',
    });
    expect(isValidSolAddress(solAddr)).toBe(true);
  });

  it('hints the TRON chain for a TRON address pasted elsewhere', () => {
    expect(validateReceiverAddress(tronAddr, 'eth')).toEqual({
      valid: false,
      warningChainType: 'tron',
    });
    expect(validateReceiverAddress(tronAddr, 'btc')).toEqual({
      valid: false,
      warningChainType: 'tron',
    });
    expect(validateReceiverAddress(tronAddr, 'kas')).toEqual({
      valid: false,
      warningChainType: 'tron',
    });
    expect(
      validateReceiverAddress(
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        'tron',
      ),
    ).toEqual({ valid: false, warningChainType: 'evm' });
  });

  it('QR: drops a tron: scheme and query, never changes case', () => {
    expect(addressFromScannedQr(tronAddr, 'tron')).toBe(tronAddr);
    expect(addressFromScannedQr(`tron:${tronAddr}?amount=5`, 'tron')).toBe(
      tronAddr,
    );
    expect(addressFromScannedQr(`  ${tronAddr}#x `, 'tron')).toBe(tronAddr);
  });
});

describe('TRON explorer links (Tronscan hash routes)', () => {
  const txid = 'ab'.repeat(32);
  it('mainnet', () => {
    expect(explorerTxUrl('tron', txid)).toBe(
      `https://tronscan.org/#/transaction/${txid}`,
    );
    expect(
      explorerAddressUrl('tron', 'TWq9eJbomJDmkME7ahC4renGL2BXacL2vd'),
    ).toBe('https://tronscan.org/#/address/TWq9eJbomJDmkME7ahC4renGL2BXacL2vd');
  });
  it('nile', () => {
    expect(explorerTxUrl('tronNile', txid)).toBe(
      `https://nile.tronscan.org/#/transaction/${txid}`,
    );
  });
});
