// @ts-nocheck test suite
/**
 * Kaspa keys and addresses — reproduces EVERY vector in
 * ~/repos/KASPA_SSP_CONTRACT.md §2. SSP Key, the relay and the enterprise
 * backend reproduce the same vectors; a failure here means cross-device
 * signing would break.
 */
import { describe, it, expect } from 'vitest';
import * as K from '@runonflux/kaspa-core';

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
  kasMultisigSpend,
  kasSpendToMultisig,
  kasSpendFromRedeemScript,
  kasLeafXOnlyKey,
  isValidKasAddress,
} from '../../src/lib/kaspa';
import { validateReceiverAddress } from '../../src/lib/addressValidation';
import { explorerTxUrl, explorerAddressUrl } from '../../src/lib/explorerUrl';
import { blockchains } from '../../src/storage/blockchains';

const chain = 'kas';
const W =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const Kk =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const S3 =
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';
const Z = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

const accountXpub = (mnemonic: string, account: number) =>
  getMasterXpub(mnemonic, 48, 111111, account, 'p2sh', chain);

describe('Kaspa chain identity (contract §1)', () => {
  it('matches the contract table', () => {
    const c = blockchains.kas;
    expect(c.id).toBe('kas');
    expect(c.chainType).toBe('kas');
    expect(c.libid).toBe('kaspa');
    expect(c.name).toBe('Kaspa');
    expect(c.symbol).toBe('KAS');
    expect(c.decimals).toBe(8);
    expect(c.slip).toBe(111111);
    expect(c.scriptType).toBe('p2sh');
    expect(c.bip32).toEqual({ public: 0x0488b21e, private: 0x0488ade4 });
    expect(c.backend).toBe('kaspa-rest');
    expect(c.node).toBe('api-kaspa.sspwallet.io');
    expect(c.maxFee).toBe(500000000);
    expect(c.onramperNetwork).toBeTruthy();
  });
});

describe('Kaspa consumer 2-of-2 vectors (contract §2)', () => {
  const walletXpub =
    'xpub6DwmUozY2BmaakpAvJfzgSGEhHS16hHtGr4pD4oQHVDgPKXJ5qPgZiz6VnEzZagxGyNs1J2m3WG2ozrXW8hFWA49pdhuYsHtch82YuDCfMv';
  const keyXpub =
    'xpub6DdfuUroHv5Pxor7HHZcGiZxWUWwdCWXr62PxYUv2uSrDTJtcFreJMktPuN2TUiwsgNPD4jmWaAEgerDQUo4qSVyFUrhdXxw1FxRhARFB7k';

  it("derives the account xpubs at m/48'/111111'/0'/0'", () => {
    expect(accountXpub(W, 0)).toBe(walletXpub);
    expect(accountXpub(Kk, 0)).toBe(keyXpub);
  });

  const leaves = [
    {
      path: [0, 0],
      address:
        'kaspa:prfu8rp4ek453lkhcewmn7w9acdqms9q2pegav5vhx6zscu73xh4ux2mdv2wp',
      redeemScript:
        '5220419c6700d68f2eca22b92ddde3b4dad5923129493f497b81732b25a951e1378d20c6fbbe518f3c0d33bbfae2726e42220c36e274eaba84065d01b72543c1f2b06252ae',
    },
    {
      path: [0, 1],
      address:
        'kaspa:prqacpva8h4tyslt7xe9srkrwjtsdnvss0xqy5u6uy00qwpacdrjwa2uegg0n',
      redeemScript:
        '52206196e92a4e203a5ed42756df5098b8b720f83b7bd4e7e49c138b67875fc6a7e620bcabbd9ff69b53dcfe57343ae8e7b73ef8890f145267e921f4901cff83cc9be952ae',
    },
    {
      path: [1, 0],
      address:
        'kaspa:pzdvhnjd29lzfqwkg55wx36pq2ryhxn9m5ldqgjhrq39c558ac86xtjug0cee',
      redeemScript:
        '52203be7ced316198d9a2aa16da709163652ead22031710b2ffbcb1a4d7e86bea49920f4bc37170d7b5b7d35f8a969ffdab90383f08164ea848cfb6031488ddfa4038352ae',
    },
  ];

  for (const leaf of leaves) {
    const [typeIndex, addressIndex] = leaf.path;
    it(`leaf ${typeIndex}-${addressIndex} → address + redeem script`, () => {
      const out = generateMultisigAddress(
        walletXpub,
        keyXpub,
        typeIndex,
        addressIndex,
        chain,
      );
      expect(out.address).toBe(leaf.address);
      expect(out.redeemScript).toBe(leaf.redeemScript);
      expect(out.witnessScript).toBeUndefined();
    });

    it(`leaf ${typeIndex}-${addressIndex} is independent of xpub order (library sorts)`, () => {
      const out = generateMultisigAddress(
        keyXpub,
        walletXpub,
        typeIndex,
        addressIndex,
        chain,
      );
      expect(out.address).toBe(leaf.address);
      expect(out.redeemScript).toBe(leaf.redeemScript);
    });
  }

  it('wallet signing key matches its xpub leaf (x-only)', () => {
    const xpriv = getMasterXpriv(W, 48, 111111, 0, 'p2sh', chain);
    const kp = generateAddressKeypair(xpriv, 0, 0, chain);
    expect(kp.privKey).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.pubKey).toBe(
      K.bytesToHex(kasLeafXOnlyKey(walletXpub, 0, 0, chain)),
    );
    const signer = K.localSigner(K.hexToBytes(kp.privKey));
    expect(K.bytesToHex(signer.xOnlyPublicKey)).toBe(kp.pubKey);
    signer.destroy();
    // and the key is one of the vault's two keys
    const spend = kasSpendFromRedeemScript(leaves[0].redeemScript);
    expect(
      K.spendSigningKeys(spend).some((k) => K.bytesToHex(k) === kp.pubKey),
    ).toBe(true);
  });
});

describe('Kaspa enterprise vectors (contract §2)', () => {
  const signerXpubs = {
    W: 'xpub6DkDQbdPx7UVVTeqdCdSZz3Mh2V2g7qGTUsGzPN5QhsfYrmEzpkYTz6U7dnndcYBrS1EuCHcCvK3FQfWhkdJyCpC9ckAXxVYdREzvC12LaC',
    Kk: 'xpub6E73xs4aQVGrr9kyhfKAHoXN1zvKxWLwdPQaS8tqjiS9oQA1r1JjDeHGkrReH9ubYprZHwiHZK1JVFavmKLv9eNZG9iay5hDCrCVXBpRQUt',
    S3: 'xpub6Dx5wA7Btx3nUma536j4Ut6tLzMospbUMsJxtzV1YbMHr1eVZwBGEZz1ytZgfJZsDCipfuweS4EkHVSQ3cGKfttpcRLv2gZE8Nrje3H3Hmg',
    Z: 'xpub6FA3kXS5roZ948ZnUmXeURNQ2AeQdXHfp7qVRFhmJ27D847hgasgb39yVVnzC8wtMMwcRqvtCkhjPd8V121N154kRawHMXmdFqnm3SGjKg6',
  };

  it("derives the org-account xpubs at m/48'/111111'/100'/0'", () => {
    expect(accountXpub(W, 100)).toBe(signerXpubs.W);
    expect(accountXpub(Kk, 100)).toBe(signerXpubs.Kk);
    expect(accountXpub(S3, 100)).toBe(signerXpubs.S3);
    expect(accountXpub(Z, 100)).toBe(signerXpubs.Z);
  });

  it('single-device 2-of-3 (key_only / wallet_only: one key per signer)', () => {
    const spend = kasMultisigSpend(
      [signerXpubs.W, signerXpubs.Kk, signerXpubs.S3],
      2, // m = requiredSigners
      0, // vaultIndex
      0, // addressIndex
      chain,
    );
    expect(kasSpendToMultisig(spend, chain)).toEqual({
      address:
        'kaspa:pzk5xpfj8uf5nxm3nyqnqngg98zszv8tumtgd8k20fuac865c98529gzctrgm',
      redeemScript:
        '52203c39416674d208da840b53c98b9df6ad296fec9a3a65d1a5cad6ada0c8fb41f120681d0062b4cdf201ab1c99d1de32f20222e44b6e21d18684e294544924447e0220dc64db8c6bcce69e3bb95e880b8e5e3e3faacd70d59251b283cd08eb689dd3e853ae',
    });
  });

  it('dual 2-of-2 signers (2N keys, m = 2 × requiredSigners)', () => {
    const spend = kasMultisigSpend(
      [
        signerXpubs.W, // signer A wallet
        signerXpubs.Kk, // signer A key
        signerXpubs.S3, // signer B wallet
        signerXpubs.Z, // signer B key
      ],
      4,
      0,
      0,
      chain,
    );
    expect(kasSpendToMultisig(spend, chain)).toEqual({
      address:
        'kaspa:prg4hv5wahzhnffk8q9fz3082xf9l3lewnm6shsz09vsqry9evl02fv844dxz',
      redeemScript:
        '54203c39416674d208da840b53c98b9df6ad296fec9a3a65d1a5cad6ada0c8fb41f120681d0062b4cdf201ab1c99d1de32f20222e44b6e21d18684e294544924447e0220b826d54f95c796c2bc0ef1b22e592635c9cf7561d44ff2f74c7cd7c56496480820dc64db8c6bcce69e3bb95e880b8e5e3e3faacd70d59251b283cd08eb689dd3e854ae',
    });
  });

  it('the wallet vault key (org xpriv, vaultIndex/addressIndex) is in the vault script', () => {
    const vaultXpriv = getMasterXpriv(W, 48, 111111, 100, 'p2sh', chain);
    const kp = generateAddressKeypair(vaultXpriv, 0, 0, chain);
    const spend = kasMultisigSpend(
      [signerXpubs.W, signerXpubs.Kk, signerXpubs.S3],
      2,
      0,
      0,
      chain,
    );
    expect(K.spendSigningKeys(spend).map((k) => K.bytesToHex(k))).toContain(
      kp.pubKey,
    );
  });

  it('round-trips a redeem script into the same spend', () => {
    const spend = kasMultisigSpend(
      [signerXpubs.W, signerXpubs.Kk, signerXpubs.S3],
      2,
      0,
      0,
      chain,
    );
    const again = kasSpendFromRedeemScript(
      kasSpendToMultisig(spend, chain).redeemScript,
    );
    expect(again.m).toBe(2);
    expect(kasSpendToMultisig(again, chain)).toEqual(
      kasSpendToMultisig(spend, chain),
    );
    expect(() => kasSpendFromRedeemScript('zz')).toThrow();
    expect(() => kasSpendFromRedeemScript('51ae')).toThrow();
  });
});

describe('Kaspa never reaches utxolib-only helpers', () => {
  const xpub = accountXpub(W, 0);
  const xpriv = getMasterXpriv(W, 48, 111111, 0, 'p2sh', chain);
  it('identity / node / WIF helpers refuse kas', () => {
    expect(() => generateInternalIdentityAddress(xpub, chain)).toThrow(/Kaspa/);
    expect(() => generateNodeIdentityKeypair(xpriv, 11, 0, chain)).toThrow(
      /Kaspa/,
    );
    expect(() => wifToPrivateKey('L1', chain)).toThrow(/Kaspa/);
  });
});

describe('Kaspa address validation and explorer links', () => {
  const vault =
    'kaspa:prfu8rp4ek453lkhcewmn7w9acdqms9q2pegav5vhx6zscu73xh4ux2mdv2wp';
  // P2PK address of the x-only key 0x…01 (generator point)
  const p2pk = K.scriptPublicKeyToAddress(
    K.p2pkScript(
      K.xOnlyPublicKey(
        Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0)),
      ),
    ),
    'kaspa',
  );

  it('accepts kaspa:p… and kaspa:q… addresses via kaspa-core', () => {
    expect(isValidKasAddress(vault, chain)).toBe(true);
    expect(isValidKasAddress(p2pk, chain)).toBe(true);
    expect(validateReceiverAddress(vault, chain)).toEqual({ valid: true });
    expect(validateReceiverAddress(`  ${p2pk} `, chain).valid).toBe(true);
  });

  it('rejects a corrupted checksum and prefix-less input', () => {
    const bad = vault.slice(0, -1) + (vault.endsWith('p') ? 'q' : 'p');
    expect(isValidKasAddress(bad, chain)).toBe(false);
    expect(isValidKasAddress(vault.replace('kaspa:', ''), chain)).toBe(false);
    expect(isValidKasAddress('kaspatest:' + vault.slice(6), chain)).toBe(false);
  });

  it('hints the chain type for foreign addresses on kas', () => {
    expect(
      validateReceiverAddress(
        '0x8092557902BA4dE6f83a7E27e14b8F0bF8ADFeA1',
        chain,
      ),
    ).toEqual({ valid: false, warningChainType: 'evm' });
  });

  it('flags a Kaspa address pasted into another chain', () => {
    expect(validateReceiverAddress(vault, 'btc')).toEqual({
      valid: false,
      warningChainType: 'kas',
    });
    expect(validateReceiverAddress(vault, 'eth')).toEqual({
      valid: false,
      warningChainType: 'kas',
    });
  });

  it('builds explorer.kaspa.org links with /txs and /addresses', () => {
    expect(explorerTxUrl(chain, 'ab'.repeat(32))).toBe(
      `https://explorer.kaspa.org/txs/${'ab'.repeat(32)}`,
    );
    expect(explorerAddressUrl(chain, vault)).toBe(
      `https://explorer.kaspa.org/addresses/${vault}`,
    );
  });
});
