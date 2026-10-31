// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';
import * as accountAbstraction from '@runonflux/aa-schnorr-multisig-sdk';
import { ethers } from 'ethers';
import {
  parseTypedData,
  serializeTypedData,
  typedDataChainId,
  typedDataDigest,
  typedDataRisk,
} from '../../src/lib/typedData';
import {
  buildPersonalSignPreimage,
  signMessageWithSchnorrMultisig,
  verifyMultisigSignature,
} from '../../src/lib/evmSigning';

// The example from the EIP-712 specification, with its published digest.
const MAIL = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
  },
  primaryType: 'Mail',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
  },
  message: {
    from: {
      name: 'Cow',
      wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
    },
    to: {
      name: 'Bob',
      wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
    },
    contents: 'Hello, Bob!',
  },
};
const MAIL_DIGEST =
  '0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2';

const PERMIT = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Permit',
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  message: {
    owner: '0x1111111111111111111111111111111111111111',
    spender: '0x2222222222222222222222222222222222222222',
    value:
      '115792089237316195423570985008687907853269984665640564039457584007913129639935',
    nonce: '0',
    deadline: '1893456000',
  },
};

describe('parseTypedData', () => {
  it('hashes the EIP-712 specification example to its published digest', () => {
    expect(typedDataDigest(parseTypedData(MAIL))).toBe(MAIL_DIGEST);
    expect(typedDataDigest(parseTypedData(JSON.stringify(MAIL)))).toBe(
      MAIL_DIGEST,
    );
  });

  it('round-trips through the canonical JSON sent to SSP Key', () => {
    const json = serializeTypedData(parseTypedData(MAIL));
    expect(typedDataDigest(parseTypedData(json))).toBe(MAIL_DIGEST);
  });

  it('drops unused types instead of refusing them', () => {
    const withUnused = {
      ...MAIL,
      types: { ...MAIL.types, Unused: [{ name: 'x', type: 'uint256' }] },
    };
    const parsed = parseTypedData(withUnused);
    expect(parsed.types.Unused).toBeUndefined();
    expect(typedDataDigest(parsed)).toBe(MAIL_DIGEST);
  });

  it('refuses an EIP712Domain that does not match the domain', () => {
    const wrongOrder = {
      ...MAIL,
      types: {
        ...MAIL.types,
        EIP712Domain: [...MAIL.types.EIP712Domain].reverse(),
      },
    };
    expect(() => parseTypedData(wrongOrder)).toThrow(/EIP712Domain/);
    const extraField = {
      ...MAIL,
      domain: { ...MAIL.domain, salt: ethers.ZeroHash },
    };
    expect(() => parseTypedData(extraField)).toThrow(/EIP712Domain/);
  });

  it('refuses malformed payloads', () => {
    expect(() => parseTypedData('not json')).toThrow();
    expect(() => parseTypedData({ ...MAIL, primaryType: 'Missing' })).toThrow();
    expect(() =>
      parseTypedData({ ...MAIL, primaryType: 'EIP712Domain' }),
    ).toThrow();
    expect(() =>
      parseTypedData({ ...MAIL, domain: { ...MAIL.domain, evil: 1 } }),
    ).toThrow(/unknown field/);
    expect(() =>
      parseTypedData({
        ...MAIL,
        message: { ...MAIL.message, contents: { not: 'a string' } },
      }),
    ).toThrow();
  });

  it('reads the domain chainId', () => {
    expect(typedDataChainId(parseTypedData(MAIL))).toBe('1');
    const noChain = {
      ...MAIL,
      types: {
        ...MAIL.types,
        EIP712Domain: MAIL.types.EIP712Domain.filter(
          (f) => f.name !== 'chainId',
        ),
      },
      domain: { ...MAIL.domain, chainId: undefined },
    };
    expect(typedDataChainId(parseTypedData(noChain))).toBeNull();
  });

  it('flags permits as approvals', () => {
    expect(typedDataRisk(parseTypedData(PERMIT))).toBe('approval');
    expect(typedDataRisk(parseTypedData(MAIL))).toBeNull();
  });
});

/** SSP Key's half, with the real SDK (mirrors ssp-key evmSigning). */
function keyCompletes(walletKeyPair, keyPrivHex, partial, digest) {
  const signer =
    accountAbstraction.helpers.SchnorrHelpers.createSchnorrSigner(keyPrivHex);
  signer.restorePubNonces(
    new accountAbstraction.types.Key(Buffer.from(partial.keyK, 'hex')),
    new accountAbstraction.types.Key(Buffer.from(partial.keyKTwo, 'hex')),
  );
  const publicKeys = [
    new accountAbstraction.types.Key(Buffer.from(walletKeyPair.pubKey, 'hex')),
    signer.getPubKey(),
  ];
  const publicNonces = [
    {
      kPublic: new accountAbstraction.types.Key(
        Buffer.from(partial.pubNoncesOne.kPublic, 'hex'),
      ),
      kTwoPublic: new accountAbstraction.types.Key(
        Buffer.from(partial.pubNoncesOne.kTwoPublic, 'hex'),
      ),
    },
    signer.getPubNonces(),
  ];
  const { signature: sigTwo } = signer.signMultiSigHash(
    digest,
    publicKeys,
    publicNonces,
  );
  const sSummed = accountAbstraction.signers.Schnorrkel.sumSigs([
    new accountAbstraction.types.SchnorrSignature(
      Buffer.from(partial.sigOne, 'hex'),
    ),
    sigTwo,
  ]);
  const combined =
    accountAbstraction.signers.Schnorrkel.getCombinedPublicKey(publicKeys);
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'bytes32', 'uint8'],
    [
      ethers.hexlify(combined.buffer.subarray(1, 33)),
      '0x' + partial.challenge,
      ethers.hexlify(sSummed.buffer),
      combined.buffer[0] - 2 + 27,
    ],
  );
}

describe('2-of-2 Schnorr signatures the account contract accepts', () => {
  function sign(message, digest) {
    const keyPriv = ethers.Wallet.createRandom().privateKey;
    const walletPriv = ethers.Wallet.createRandom().privateKey;
    const walletKeyPair = {
      privKey: walletPriv,
      pubKey: ethers.SigningKey.computePublicKey(walletPriv, true).slice(2),
    };
    const keyPub = ethers.SigningKey.computePublicKey(keyPriv, true).slice(2);
    // The Key's nonce pair, generated the way SSP Key does it.
    const nonce = accountAbstraction.core._generateNonce();
    const partial = signMessageWithSchnorrMultisig(
      message,
      walletKeyPair,
      keyPub,
      {
        kPublic: nonce.kPublic.toString('hex'),
        kTwoPublic: nonce.kTwoPublic.toString('hex'),
      },
      digest,
    );
    const signature = keyCompletes(
      walletKeyPair,
      keyPriv,
      {
        ...partial,
        keyK: nonce.k.toString('hex'),
        keyKTwo: nonce.kTwo.toString('hex'),
      },
      digest ?? ethers.solidityPackedKeccak256(['string'], [message]),
    );
    return { signature, walletPub: walletKeyPair.pubKey, keyPub };
  }

  it('typed data: valid over the EIP-712 digest only', () => {
    const payload = parseTypedData(MAIL);
    const digest = typedDataDigest(payload);
    // About half of all signatures need the verifier's high-s path.
    for (let i = 0; i < 24; i += 1) {
      const sig = sign(serializeTypedData(payload), digest);
      expect(
        verifyMultisigSignature(
          sig.signature,
          digest,
          sig.walletPub,
          sig.keyPub,
        ),
      ).toBe(true);
      expect(
        verifyMultisigSignature(
          sig.signature,
          ethers.ZeroHash,
          sig.walletPub,
          sig.keyPub,
        ),
      ).toBe(false);
    }
    const { signature, walletPub } = sign(serializeTypedData(payload), digest);
    // Another account (other key pair) does not own the signature.
    const other = ethers.SigningKey.computePublicKey(
      ethers.Wallet.createRandom().privateKey,
      true,
    ).slice(2);
    expect(verifyMultisigSignature(signature, digest, walletPub, other)).toBe(
      false,
    );
  });

  it('personal_sign: valid over hashMessage(text)', () => {
    const text = 'Sign in to example.com ✓';
    const { signature, walletPub, keyPub } = sign(
      buildPersonalSignPreimage(text),
    );
    expect(
      verifyMultisigSignature(
        signature,
        ethers.hashMessage(text),
        walletPub,
        keyPub,
      ),
    ).toBe(true);
  });

  it('a Key that signs the JSON text instead of the digest (2.1.x) fails', () => {
    const payload = parseTypedData(MAIL);
    const digest = typedDataDigest(payload);
    const json = serializeTypedData(payload);
    // wallet signs the digest, the old Key signs keccak(json): mismatch
    const { signature, walletPub, keyPub } = sign(json, digest);
    const oldKeySig = sign(json);
    expect(verifyMultisigSignature(signature, digest, walletPub, keyPub)).toBe(
      true,
    );
    expect(
      verifyMultisigSignature(
        oldKeySig.signature,
        digest,
        oldKeySig.walletPub,
        oldKeySig.keyPub,
      ),
    ).toBe(false);
  });

  it('refuses garbage', () => {
    expect(verifyMultisigSignature('0x1234', MAIL_DIGEST, '02', '03')).toBe(
      false,
    );
  });
});
