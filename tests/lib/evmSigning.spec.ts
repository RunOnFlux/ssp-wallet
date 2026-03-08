// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock the Schnorr multisig SDK ---
// vi.mock is hoisted to the top of the file, so all variables used inside
// the factory must come from vi.hoisted() to be available at hoist-time.

const {
  mockKey,
  mockSigBuffer,
  mockChallengeBuffer,
  mockSig,
  mockChallenge,
  mockPubNonces,
  mockSigner,
  MockKeyConstructor,
} = vi.hoisted(() => {
  const _mockBuffer33 = Buffer.alloc(33, 0xab);
  const _mockKey = { buffer: _mockBuffer33 };
  const _mockSigBuffer = Buffer.alloc(32, 0xcd);
  const _mockChallengeBuffer = Buffer.alloc(32, 0xef);
  const _mockSig = { buffer: _mockSigBuffer };
  const _mockChallenge = { buffer: _mockChallengeBuffer };

  const _mockPubNonces = {
    kPublic: { buffer: Buffer.alloc(33, 0x11) },
    kTwoPublic: { buffer: Buffer.alloc(33, 0x22) },
  };

  const _mockSigner = {
    generatePubNonces: vi.fn(),
    restorePubNonces: vi.fn(),
    getPubKey: vi.fn(() => _mockKey),
    getPubNonces: vi.fn(() => _mockPubNonces),
    signMultiSigMsg: vi.fn(() => ({
      signature: _mockSig,
      challenge: _mockChallenge,
    })),
    signMultiSigHash: vi.fn(() => ({
      signature: _mockSig,
      challenge: _mockChallenge,
    })),
  };

  // Key must support `new` — use a proper constructor function.
  // The wrapper tracks calls via .mock while delegating to the real constructor.
  function _KeyImpl(buf) {
    this.buffer = buf;
  }
  const _MockKeyConstructor = vi.fn(function (buf) {
    return new _KeyImpl(buf);
  });

  return {
    mockKey: _mockKey,
    mockSigBuffer: _mockSigBuffer,
    mockChallengeBuffer: _mockChallengeBuffer,
    mockSig: _mockSig,
    mockChallenge: _mockChallenge,
    mockPubNonces: _mockPubNonces,
    mockSigner: _mockSigner,
    MockKeyConstructor: _MockKeyConstructor,
  };
});

vi.mock('@runonflux/aa-schnorr-multisig-sdk', () => ({
  helpers: {
    SchnorrHelpers: {
      createSchnorrSigner: vi.fn(() => mockSigner),
    },
  },
  types: {
    Key: MockKeyConstructor,
    PublicNonces: vi.fn(),
  },
  signers: {
    Schnorrkel: {
      getCombinedPublicKey: vi.fn(() => mockKey),
      sumSigs: vi.fn(() => mockSig),
    },
  },
}));

import {
  signMessageWithSchnorrMultisig,
  signVaultMessageWithSchnorr,
} from '../../src/lib/evmSigning';
import * as accountAbstraction from '@runonflux/aa-schnorr-multisig-sdk';

// --- Test fixtures ---

const WALLET_KEYPAIR = {
  privKey: '0x' + 'aa'.repeat(32),
  pubKey: 'ab'.repeat(33),
};

const COUNTERPARTY_PUB_KEY_HEX = 'cc'.repeat(33);

const COUNTERPARTY_NONCES = {
  kPublic: 'dd'.repeat(33),
  kTwoPublic: 'ee'.repeat(33),
};

const MESSAGE = 'Hello Schnorr multisig signing test message';

// Wallet nonce for vault signing (pre-reserved)
const WALLET_NONCE = {
  k: 'f1'.repeat(32),
  kTwo: 'f2'.repeat(32),
  kPublic: mockPubNonces.kPublic.buffer.toString('hex'),
  kTwoPublic: mockPubNonces.kTwoPublic.buffer.toString('hex'),
};

// The signer's public key hex (matches mockKey)
const SIGNER_PUB_KEY_HEX = mockKey.buffer.toString('hex');

describe('evmSigning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock behaviour after each test
    mockSigner.getPubKey.mockReturnValue(mockKey);
    mockSigner.getPubNonces.mockReturnValue(mockPubNonces);
    mockSigner.signMultiSigMsg.mockReturnValue({
      signature: mockSig,
      challenge: mockChallenge,
    });
    mockSigner.signMultiSigHash.mockReturnValue({
      signature: mockSig,
      challenge: mockChallenge,
    });
  });

  // ==========================================================================
  // signMessageWithSchnorrMultisig -- fresh nonce signing (standard 2-of-2)
  // ==========================================================================
  describe('signMessageWithSchnorrMultisig', () => {
    it('should create a signer from the wallet private key', () => {
      signMessageWithSchnorrMultisig(
        MESSAGE,
        WALLET_KEYPAIR,
        COUNTERPARTY_PUB_KEY_HEX,
        COUNTERPARTY_NONCES,
      );

      expect(
        accountAbstraction.helpers.SchnorrHelpers.createSchnorrSigner,
      ).toHaveBeenCalledWith(WALLET_KEYPAIR.privKey);
    });

    it('should generate fresh nonces (calls generatePubNonces)', () => {
      signMessageWithSchnorrMultisig(
        MESSAGE,
        WALLET_KEYPAIR,
        COUNTERPARTY_PUB_KEY_HEX,
        COUNTERPARTY_NONCES,
      );

      expect(mockSigner.generatePubNonces).toHaveBeenCalledTimes(1);
    });

    it('should return sigOne, challenge, pubNoncesOne, pubNoncesTwo as hex strings', () => {
      const result = signMessageWithSchnorrMultisig(
        MESSAGE,
        WALLET_KEYPAIR,
        COUNTERPARTY_PUB_KEY_HEX,
        COUNTERPARTY_NONCES,
      );

      expect(result).toHaveProperty('sigOne');
      expect(result).toHaveProperty('challenge');
      expect(result).toHaveProperty('pubNoncesOne');
      expect(result).toHaveProperty('pubNoncesTwo');

      // All top-level string fields should be hex
      expect(result.sigOne).toBe(mockSigBuffer.toString('hex'));
      expect(result.challenge).toBe(mockChallengeBuffer.toString('hex'));

      // pubNoncesOne comes from the signer's internal nonces
      expect(result.pubNoncesOne.kPublic).toBe(
        mockPubNonces.kPublic.buffer.toString('hex'),
      );
      expect(result.pubNoncesOne.kTwoPublic).toBe(
        mockPubNonces.kTwoPublic.buffer.toString('hex'),
      );

      // pubNoncesTwo is the counterparty's nonces passed through
      expect(result.pubNoncesTwo).toBe(COUNTERPARTY_NONCES);
    });

    it('should pass the message to signMultiSigMsg', () => {
      signMessageWithSchnorrMultisig(
        MESSAGE,
        WALLET_KEYPAIR,
        COUNTERPARTY_PUB_KEY_HEX,
        COUNTERPARTY_NONCES,
      );

      expect(mockSigner.signMultiSigMsg).toHaveBeenCalledTimes(1);
      const [msg] = mockSigner.signMultiSigMsg.mock.calls[0];
      expect(msg).toBe(MESSAGE);
    });

    it('should pass both public keys to signMultiSigMsg', () => {
      signMessageWithSchnorrMultisig(
        MESSAGE,
        WALLET_KEYPAIR,
        COUNTERPARTY_PUB_KEY_HEX,
        COUNTERPARTY_NONCES,
      );

      const [, publicKeys] = mockSigner.signMultiSigMsg.mock.calls[0];
      expect(publicKeys).toHaveLength(2);
      // First key is the signer's own key (from getPubKey)
      expect(publicKeys[0]).toBe(mockKey);
      // Second key is created from the counterparty's hex
      expect(publicKeys[1].buffer).toEqual(
        Buffer.from(COUNTERPARTY_PUB_KEY_HEX, 'hex'),
      );
    });

    it('should throw when public key initialization fails (null getPubKey)', () => {
      mockSigner.getPubKey.mockReturnValueOnce(null);

      expect(() =>
        signMessageWithSchnorrMultisig(
          MESSAGE,
          WALLET_KEYPAIR,
          COUNTERPARTY_PUB_KEY_HEX,
          COUNTERPARTY_NONCES,
        ),
      ).toThrow('Failed to initialize Schnorr signers');
    });

    it('should throw when nonce generation fails (null getPubNonces)', () => {
      mockSigner.getPubNonces.mockReturnValueOnce(null);

      expect(() =>
        signMessageWithSchnorrMultisig(
          MESSAGE,
          WALLET_KEYPAIR,
          COUNTERPARTY_PUB_KEY_HEX,
          COUNTERPARTY_NONCES,
        ),
      ).toThrow('Failed to generate public nonces');
    });

    it('should propagate SDK signing errors', () => {
      mockSigner.signMultiSigMsg.mockImplementationOnce(() => {
        throw new Error('SDK internal failure');
      });

      expect(() =>
        signMessageWithSchnorrMultisig(
          MESSAGE,
          WALLET_KEYPAIR,
          COUNTERPARTY_PUB_KEY_HEX,
          COUNTERPARTY_NONCES,
        ),
      ).toThrow('SDK internal failure');
    });

    it('should create a Key from publicKey2HEX using the SDK types.Key constructor', () => {
      signMessageWithSchnorrMultisig(
        MESSAGE,
        WALLET_KEYPAIR,
        COUNTERPARTY_PUB_KEY_HEX,
        COUNTERPARTY_NONCES,
      );

      // types.Key is called for: pubKeyTwo, kPublic nonce, kTwoPublic nonce
      const keyCalls = MockKeyConstructor.mock.calls;
      // Find the call that created pubKeyTwo from the counterparty hex
      const pubKeyTwoCall = keyCalls.find(
        (call) =>
          call[0] instanceof Buffer &&
          call[0].equals(Buffer.from(COUNTERPARTY_PUB_KEY_HEX, 'hex')),
      );
      expect(pubKeyTwoCall).toBeDefined();
    });

    it('should convert all outputs to hex strings (no Buffer objects in result)', () => {
      const result = signMessageWithSchnorrMultisig(
        MESSAGE,
        WALLET_KEYPAIR,
        COUNTERPARTY_PUB_KEY_HEX,
        COUNTERPARTY_NONCES,
      );

      expect(typeof result.sigOne).toBe('string');
      expect(typeof result.challenge).toBe('string');
      expect(typeof result.pubNoncesOne.kPublic).toBe('string');
      expect(typeof result.pubNoncesOne.kTwoPublic).toBe('string');
      expect(typeof result.pubNoncesTwo.kPublic).toBe('string');
      expect(typeof result.pubNoncesTwo.kTwoPublic).toBe('string');

      // Verify they are valid hex (even-length, hex chars only)
      const hexRegex = /^[0-9a-f]+$/;
      expect(result.sigOne).toMatch(hexRegex);
      expect(result.challenge).toMatch(hexRegex);
      expect(result.pubNoncesOne.kPublic).toMatch(hexRegex);
      expect(result.pubNoncesOne.kTwoPublic).toMatch(hexRegex);
    });
  });

  // ==========================================================================
  // signVaultMessageWithSchnorr -- pre-reserved nonce signing (vault M-of-N)
  // ==========================================================================
  describe('signVaultMessageWithSchnorr', () => {
    // Helper: build arrays for a 2-of-2 vault (4 public keys, 4 nonces).
    // In M-of-N Schnorr each signer contributes 2 keys (wallet+key),
    // so a 2-of-2 vault has 4 entries total.
    function buildTwoOfTwoArrays() {
      const allPublicKeys = [
        SIGNER_PUB_KEY_HEX,
        'bb'.repeat(33),
        'bc'.repeat(33),
        'bd'.repeat(33),
      ];
      const allPublicNonces = [
        {
          kPublic: mockPubNonces.kPublic.buffer.toString('hex'),
          kTwoPublic: mockPubNonces.kTwoPublic.buffer.toString('hex'),
        },
        { kPublic: 'a1'.repeat(33), kTwoPublic: 'a2'.repeat(33) },
        { kPublic: 'a3'.repeat(33), kTwoPublic: 'a4'.repeat(33) },
        { kPublic: 'a5'.repeat(33), kTwoPublic: 'a6'.repeat(33) },
      ];
      return { allPublicKeys, allPublicNonces };
    }

    // Helper: build arrays for a 2-of-3 vault (6 public keys, 6 nonces)
    function buildTwoOfThreeArrays() {
      const allPublicKeys = [
        SIGNER_PUB_KEY_HEX,
        'b1'.repeat(33),
        'b2'.repeat(33),
        'b3'.repeat(33),
        'b4'.repeat(33),
        'b5'.repeat(33),
      ];
      const allPublicNonces = [
        {
          kPublic: mockPubNonces.kPublic.buffer.toString('hex'),
          kTwoPublic: mockPubNonces.kTwoPublic.buffer.toString('hex'),
        },
        { kPublic: 'c1'.repeat(33), kTwoPublic: 'c2'.repeat(33) },
        { kPublic: 'c3'.repeat(33), kTwoPublic: 'c4'.repeat(33) },
        { kPublic: 'c5'.repeat(33), kTwoPublic: 'c6'.repeat(33) },
        { kPublic: 'c7'.repeat(33), kTwoPublic: 'c8'.repeat(33) },
        { kPublic: 'c9'.repeat(33), kTwoPublic: 'ca'.repeat(33) },
      ];
      return { allPublicKeys, allPublicNonces };
    }

    it('should restore pre-reserved nonces (calls restorePubNonces)', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      expect(mockSigner.restorePubNonces).toHaveBeenCalledTimes(1);
      // Verify the restored nonce buffers contain the correct data
      const [kPrivArg, kTwoPrivArg] = mockSigner.restorePubNonces.mock.calls[0];
      expect(kPrivArg.buffer).toEqual(Buffer.from(WALLET_NONCE.k, 'hex'));
      expect(kTwoPrivArg.buffer).toEqual(Buffer.from(WALLET_NONCE.kTwo, 'hex'));
    });

    it('should NOT generate fresh nonces (never calls generatePubNonces)', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      expect(mockSigner.generatePubNonces).not.toHaveBeenCalled();
    });

    it('should throw when allPublicKeys is empty', () => {
      expect(() =>
        signVaultMessageWithSchnorr(
          MESSAGE,
          WALLET_KEYPAIR,
          WALLET_NONCE,
          [],
          [COUNTERPARTY_NONCES],
        ),
      ).toThrow('Invalid signing arrays: 0 keys vs 1 nonces');
    });

    it('should throw when allPublicNonces is empty', () => {
      expect(() =>
        signVaultMessageWithSchnorr(
          MESSAGE,
          WALLET_KEYPAIR,
          WALLET_NONCE,
          [SIGNER_PUB_KEY_HEX],
          [],
        ),
      ).toThrow('Invalid signing arrays: 1 keys vs 0 nonces');
    });

    it('should throw when arrays have different lengths (keys.length !== nonces.length)', () => {
      expect(() =>
        signVaultMessageWithSchnorr(
          MESSAGE,
          WALLET_KEYPAIR,
          WALLET_NONCE,
          [SIGNER_PUB_KEY_HEX, 'bb'.repeat(33)],
          [COUNTERPARTY_NONCES],
        ),
      ).toThrow('Invalid signing arrays: 2 keys vs 1 nonces');
    });

    it('should find the signer public key in allPublicKeys array', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      // getPubKey is called to locate the signer's index
      expect(mockSigner.getPubKey).toHaveBeenCalled();
    });

    it('should throw when wallet public key is not found in array (key mismatch)', () => {
      const allPublicKeys = ['ff'.repeat(33), 'fe'.repeat(33)];
      const allPublicNonces = [
        { kPublic: 'a1'.repeat(33), kTwoPublic: 'a2'.repeat(33) },
        { kPublic: 'a3'.repeat(33), kTwoPublic: 'a4'.repeat(33) },
      ];

      expect(() =>
        signVaultMessageWithSchnorr(
          MESSAGE,
          WALLET_KEYPAIR,
          WALLET_NONCE,
          allPublicKeys,
          allPublicNonces,
        ),
      ).toThrow('Wallet public key not found in allSignerKeys array');
    });

    it('should replace the signer Key entry with the internal Key instance', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      // signMultiSigHash receives the publicKeys array
      const [, publicKeys] = mockSigner.signMultiSigHash.mock.calls[0];
      // The signer's slot (index 0) must be the signer's internal Key (mockKey),
      // not a new Key constructed from hex
      expect(publicKeys[0]).toBe(mockKey);
    });

    it('should use the signer internal nonces for the matching slot', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      const [, , publicNoncesArr] = mockSigner.signMultiSigHash.mock.calls[0];
      // Index 0 should be the signer's internal nonces (mockPubNonces)
      expect(publicNoncesArr[0]).toBe(mockPubNonces);
      // Other indices should NOT be the signer's nonces
      expect(publicNoncesArr[1]).not.toBe(mockPubNonces);
    });

    it('should return sigOne and challenge as hex strings', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      const result = signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      expect(typeof result.sigOne).toBe('string');
      expect(typeof result.challenge).toBe('string');
      expect(result.sigOne).toBe(mockSigBuffer.toString('hex'));
      expect(result.challenge).toBe(mockChallengeBuffer.toString('hex'));

      // Verify valid hex format
      const hexRegex = /^[0-9a-f]+$/;
      expect(result.sigOne).toMatch(hexRegex);
      expect(result.challenge).toMatch(hexRegex);
    });

    it('should handle 2-of-2 correctly (4 keys, 4 nonces)', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      const result = signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      // signMultiSigHash should receive arrays of length 4
      const [, publicKeys, publicNoncesArr] =
        mockSigner.signMultiSigHash.mock.calls[0];
      expect(publicKeys).toHaveLength(4);
      expect(publicNoncesArr).toHaveLength(4);
      expect(result.sigOne).toBeDefined();
      expect(result.challenge).toBeDefined();
    });

    it('should handle 2-of-3 correctly (6 keys, 6 nonces)', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfThreeArrays();

      const result = signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      const [, publicKeys, publicNoncesArr] =
        mockSigner.signMultiSigHash.mock.calls[0];
      expect(publicKeys).toHaveLength(6);
      expect(publicNoncesArr).toHaveLength(6);
      expect(result.sigOne).toBeDefined();
      expect(result.challenge).toBeDefined();
    });

    it('should pass the correct message to signMultiSigHash', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();
      const customMessage = 'Custom vault transaction message for signing';

      signVaultMessageWithSchnorr(
        customMessage,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      const [msg] = mockSigner.signMultiSigHash.mock.calls[0];
      expect(msg).toBe(customMessage);
    });

    it('should convert nonce hex strings to Key objects via SDK types.Key', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      signVaultMessageWithSchnorr(
        MESSAGE,
        WALLET_KEYPAIR,
        WALLET_NONCE,
        allPublicKeys,
        allPublicNonces,
      );

      // types.Key (MockKeyConstructor) is called for:
      //   - kPrivate (walletNonce.k)
      //   - kTwoPrivate (walletNonce.kTwo)
      //   - Each public key in allPublicKeys (4 calls)
      //   - Each non-signer nonce's kPublic and kTwoPublic
      //     (signer slot uses internal nonces, so 3 pairs = 6 calls)
      // Total: 2 + 4 + 6 = 12 calls
      const keyCalls = MockKeyConstructor.mock.calls;
      expect(keyCalls.length).toBeGreaterThanOrEqual(8);

      // Verify kPrivate was created from walletNonce.k
      const kPrivCall = keyCalls.find(
        (call) =>
          call[0] instanceof Buffer &&
          call[0].equals(Buffer.from(WALLET_NONCE.k, 'hex')),
      );
      expect(kPrivCall).toBeDefined();

      // Verify kTwoPrivate was created from walletNonce.kTwo
      const kTwoPrivCall = keyCalls.find(
        (call) =>
          call[0] instanceof Buffer &&
          call[0].equals(Buffer.from(WALLET_NONCE.kTwo, 'hex')),
      );
      expect(kTwoPrivCall).toBeDefined();
    });

    it('should propagate SDK signing errors', () => {
      const { allPublicKeys, allPublicNonces } = buildTwoOfTwoArrays();

      mockSigner.signMultiSigHash.mockImplementationOnce(() => {
        throw new Error('Schnorr signing failed: invalid nonce');
      });

      expect(() =>
        signVaultMessageWithSchnorr(
          MESSAGE,
          WALLET_KEYPAIR,
          WALLET_NONCE,
          allPublicKeys,
          allPublicNonces,
        ),
      ).toThrow('Schnorr signing failed: invalid nonce');
    });
  });
});
