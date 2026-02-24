// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -------------------------------------------------------------------------
// Hoisted mocks — vi.hoisted runs BEFORE vi.mock factory hoisting,
// so these variables are available inside mock factories.
// -------------------------------------------------------------------------
const {
  mockSecureStorage,
  mockPassworderEncrypt,
  mockPassworderDecrypt,
  mockGeneratePublicNonce,
  mockAxiosPost,
} = vi.hoisted(() => ({
  mockSecureStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  mockPassworderEncrypt: vi.fn(),
  mockPassworderDecrypt: vi.fn(),
  mockGeneratePublicNonce: vi.fn(),
  mockAxiosPost: vi.fn(),
}));

const MOCK_FINGERPRINT = 'a'.repeat(64);

// -------------------------------------------------------------------------
// Module mocks
// -------------------------------------------------------------------------

vi.mock('react-secure-storage', () => ({
  default: mockSecureStorage,
}));

vi.mock('@metamask/browser-passworder', () => ({
  encrypt: mockPassworderEncrypt,
  decrypt: mockPassworderDecrypt,
}));

vi.mock('../../src/lib/fingerprint', () => ({
  getFingerprint: vi.fn(() => MOCK_FINGERPRINT),
}));

vi.mock('../../src/lib/wallet', () => ({
  generatePublicNonce: mockGeneratePublicNonce,
}));

vi.mock('../../src/storage/ssp', () => ({
  sspConfig: vi.fn(() => ({ relay: 'relay.test.io' })),
}));

vi.mock('axios', () => ({
  default: { post: mockAxiosPost },
  post: mockAxiosPost,
}));

import {
  loadEncryptedNonces,
  saveEncryptedNonces,
  replenishWalletEnterpriseNonces,
} from '../../src/lib/enterpriseNonces';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'enterpriseNoncesWallet';
const FAKE_PASSWORD_BLOB = 'encrypted-password-blob';
const FAKE_PASSWORD = 'decrypted-password';
const FAKE_WK_IDENTITY = 'bc1qtest_wk_identity_abc123';

function makeFakeNonce(index: number) {
  return {
    k: `k_private_${index}`,
    kTwo: `kTwo_private_${index}`,
    kPublic: `kPublic_${index}`,
    kTwoPublic: `kTwoPublic_${index}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Enterprise Nonces — Security-critical nonce management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: passworderDecrypt resolves the 2-step decryption chain
    // Step 1: fingerprint + passwordBlob -> password
    // Step 2: password + encrypted -> JSON string of nonces
    mockPassworderDecrypt.mockImplementation((key: string, data: string) => {
      if (key === MOCK_FINGERPRINT && data === FAKE_PASSWORD_BLOB) {
        return FAKE_PASSWORD; // step 1
      }
      // step 2 — return whatever was "encrypted"
      return data;
    });

    mockPassworderEncrypt.mockImplementation(
      (_key: string, data: string) => `encrypted(${data})`,
    );

    // Default nonce generator — produces unique nonces
    let nonceCounter = 0;
    mockGeneratePublicNonce.mockImplementation(() => {
      nonceCounter++;
      return makeFakeNonce(nonceCounter);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // loadEncryptedNonces
  // =========================================================================
  describe('loadEncryptedNonces(passwordBlob)', () => {
    it('should decrypt and return nonces array from storage', async () => {
      const storedNonces = [makeFakeNonce(1), makeFakeNonce(2)];
      const storedJson = JSON.stringify(storedNonces);
      mockSecureStorage.getItem.mockReturnValue(storedJson);
      // Step 2 decryption returns the JSON string
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        if (key === FAKE_PASSWORD) return storedJson;
        return key;
      });

      const result = await loadEncryptedNonces(FAKE_PASSWORD_BLOB);

      expect(result).toEqual(storedNonces);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no stored nonces exist', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);

      const result = await loadEncryptedNonces(FAKE_PASSWORD_BLOB);

      expect(result).toEqual([]);
      // Should not attempt any decryption if nothing is stored
      // (early return before fingerprint/password decryption)
      expect(mockPassworderDecrypt).not.toHaveBeenCalled();
    });

    it('should return empty array when decryption fails', async () => {
      mockSecureStorage.getItem.mockReturnValue('corrupted-data');
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        throw new Error('Decryption failed');
      });

      const result = await loadEncryptedNonces(FAKE_PASSWORD_BLOB);

      expect(result).toEqual([]);
    });

    it('should return empty array when password decryption returns non-string', async () => {
      mockSecureStorage.getItem.mockReturnValue('some-encrypted-data');
      // Step 1 returns a non-string
      mockPassworderDecrypt.mockImplementation(() => {
        return 12345; // not a string
      });

      const result = await loadEncryptedNonces(FAKE_PASSWORD_BLOB);

      expect(result).toEqual([]);
    });

    it('should return empty array when second decryption returns non-string', async () => {
      mockSecureStorage.getItem.mockReturnValue('some-encrypted-data');
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        return { not: 'a string' }; // non-string from step 2
      });

      const result = await loadEncryptedNonces(FAKE_PASSWORD_BLOB);

      expect(result).toEqual([]);
    });

    it('should use correct storage key', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);

      await loadEncryptedNonces(FAKE_PASSWORD_BLOB);

      expect(mockSecureStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  // =========================================================================
  // saveEncryptedNonces
  // =========================================================================
  describe('saveEncryptedNonces(nonces, passwordBlob)', () => {
    it('should encrypt and save nonces to storage', async () => {
      const nonces = [makeFakeNonce(1), makeFakeNonce(2)];

      await saveEncryptedNonces(nonces, FAKE_PASSWORD_BLOB);

      // Should have encrypted the JSON-serialized nonces
      expect(mockPassworderEncrypt).toHaveBeenCalledWith(
        FAKE_PASSWORD,
        JSON.stringify(nonces),
      );
      // Should have written to secure storage
      expect(mockSecureStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.any(String),
      );
    });

    it('should use correct storage key', async () => {
      await saveEncryptedNonces([], FAKE_PASSWORD_BLOB);

      expect(mockSecureStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.anything(),
      );
    });

    it('should handle empty nonces array', async () => {
      await saveEncryptedNonces([], FAKE_PASSWORD_BLOB);

      expect(mockPassworderEncrypt).toHaveBeenCalledWith(
        FAKE_PASSWORD,
        JSON.stringify([]),
      );
      expect(mockSecureStorage.setItem).toHaveBeenCalled();
    });

    it('should throw when password decryption returns non-string', async () => {
      mockPassworderDecrypt.mockResolvedValue(99999); // non-string

      await expect(
        saveEncryptedNonces([makeFakeNonce(1)], FAKE_PASSWORD_BLOB),
      ).rejects.toThrow('Failed to decrypt password for nonce storage');
    });

    it('should propagate encryption errors (not swallow them)', async () => {
      mockPassworderEncrypt.mockRejectedValue(
        new Error('Encryption engine failure'),
      );

      await expect(
        saveEncryptedNonces([makeFakeNonce(1)], FAKE_PASSWORD_BLOB),
      ).rejects.toThrow('Encryption engine failure');
    });
  });

  // =========================================================================
  // replenishWalletEnterpriseNonces — the critical function
  // =========================================================================
  describe('replenishWalletEnterpriseNonces(wkIdentity, passwordBlob)', () => {
    it('should check current nonce count from storage', async () => {
      // Pool is full — 50 nonces
      const fullPool = Array.from({ length: 50 }, (_, i) => makeFakeNonce(i));
      mockSecureStorage.getItem.mockReturnValue('encrypted-nonces');
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        return JSON.stringify(fullPool);
      });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      // Should have loaded nonces via storage
      expect(mockSecureStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('should skip replenishment when pool is full (>= 50)', async () => {
      const fullPool = Array.from({ length: 50 }, (_, i) => makeFakeNonce(i));
      mockSecureStorage.getItem.mockReturnValue('encrypted-nonces');
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        return JSON.stringify(fullPool);
      });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      expect(mockGeneratePublicNonce).not.toHaveBeenCalled();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should skip replenishment when pool exceeds TARGET_COUNT', async () => {
      const overPool = Array.from({ length: 60 }, (_, i) => makeFakeNonce(i));
      mockSecureStorage.getItem.mockReturnValue('encrypted-nonces');
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        return JSON.stringify(overPool);
      });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      expect(mockGeneratePublicNonce).not.toHaveBeenCalled();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should generate correct number of nonces to reach TARGET_COUNT', async () => {
      const existingNonces = Array.from({ length: 30 }, (_, i) =>
        makeFakeNonce(i),
      );
      mockSecureStorage.getItem.mockReturnValue('encrypted-nonces');
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        return JSON.stringify(existingNonces);
      });
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      // Should generate 50 - 30 = 20 nonces
      expect(mockGeneratePublicNonce).toHaveBeenCalledTimes(20);
    });

    it('should generate all 50 nonces when pool is empty', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      expect(mockGeneratePublicNonce).toHaveBeenCalledTimes(50);
    });

    it('should submit public parts ONLY (not private k/kTwo) to relay', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      const [, body] = mockAxiosPost.mock.calls[0];

      // Verify ONLY public fields are sent — private key material must never leave
      for (const nonce of body.nonces) {
        expect(nonce).toHaveProperty('kPublic');
        expect(nonce).toHaveProperty('kTwoPublic');
        expect(nonce).not.toHaveProperty('k');
        expect(nonce).not.toHaveProperty('kTwo');
      }
    });

    it('should use correct relay endpoint for nonce submission', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      const [url] = mockAxiosPost.mock.calls[0];
      expect(url).toBe('https://relay.test.io/v1/nonces');
    });

    it('should submit correct wkIdentity and source to relay', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      const [, body] = mockAxiosPost.mock.calls[0];
      expect(body.wkIdentity).toBe(FAKE_WK_IDENTITY);
      expect(body.source).toBe('wallet');
    });

    it('should submit to relay BEFORE saving locally (order matters for desync prevention)', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);

      const callOrder: string[] = [];
      mockAxiosPost.mockImplementation(() => {
        callOrder.push('relay_submit');
        return Promise.resolve({ data: { status: 'success' } });
      });
      mockPassworderEncrypt.mockImplementation((_k, data) => {
        callOrder.push('encrypt_for_save');
        return `encrypted(${data})`;
      });
      // Override setItem to track order
      mockSecureStorage.setItem.mockImplementation(() => {
        callOrder.push('local_save');
      });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      // Relay submission MUST come before local persistence
      const relayIdx = callOrder.indexOf('relay_submit');
      const saveIdx = callOrder.indexOf('local_save');
      expect(relayIdx).toBeGreaterThanOrEqual(0);
      expect(saveIdx).toBeGreaterThanOrEqual(0);
      expect(relayIdx).toBeLessThan(saveIdx);
    });

    it('should save merged (existing + new) nonces to local storage after relay success', async () => {
      const existingNonces = [makeFakeNonce(100), makeFakeNonce(200)];
      mockSecureStorage.getItem.mockReturnValue('encrypted-nonces');
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        return JSON.stringify(existingNonces);
      });
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      // Track what gets encrypted for saving
      let savedData: string | undefined;
      mockPassworderEncrypt.mockImplementation((_k, data) => {
        savedData = data;
        return `encrypted(${data})`;
      });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      // The saved data should contain ALL nonces (existing + new)
      expect(savedData).toBeDefined();
      const parsedSaved = JSON.parse(savedData!);
      // 2 existing + 48 new = 50 total
      expect(parsedSaved).toHaveLength(50);
      // First two should be the existing ones
      expect(parsedSaved[0]).toEqual(makeFakeNonce(100));
      expect(parsedSaved[1]).toEqual(makeFakeNonce(200));
    });

    it('should NOT save locally when relay submission fails', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockRejectedValue(new Error('Network error'));

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      // saveEncryptedNonces calls passworderEncrypt then setItem
      // Neither should be called for saving after generation
      // Note: passworderDecrypt IS called during loadEncryptedNonces, that's fine
      expect(mockSecureStorage.setItem).not.toHaveBeenCalled();
    });

    it('should NOT save locally when relay returns 500', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockRejectedValue({
        response: { status: 500, data: 'Internal Server Error' },
      });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      expect(mockSecureStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle relay 500 error gracefully (no throw)', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockRejectedValue({
        response: { status: 500, data: 'Internal Server Error' },
      });

      // Should not throw — graceful degradation
      await expect(
        replenishWalletEnterpriseNonces(FAKE_WK_IDENTITY, FAKE_PASSWORD_BLOB),
      ).resolves.toBeUndefined();
    });

    it('should not throw on storage read errors (graceful degradation)', async () => {
      mockSecureStorage.getItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      await expect(
        replenishWalletEnterpriseNonces(FAKE_WK_IDENTITY, FAKE_PASSWORD_BLOB),
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Nonce generation integrity — preventing nonce reuse
  // =========================================================================
  describe('Nonce generation — uniqueness & structure', () => {
    it('should generate nonces with kPublic and kTwoPublic fields', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      const [, body] = mockAxiosPost.mock.calls[0];
      expect(body.nonces.length).toBeGreaterThan(0);
      for (const nonce of body.nonces) {
        expect(typeof nonce.kPublic).toBe('string');
        expect(typeof nonce.kTwoPublic).toBe('string');
        expect(nonce.kPublic.length).toBeGreaterThan(0);
        expect(nonce.kTwoPublic.length).toBeGreaterThan(0);
      }
    });

    it('should generate unique nonces — no duplicate kPublic values', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      const [, body] = mockAxiosPost.mock.calls[0];
      const kPublics = body.nonces.map((n: { kPublic: string }) => n.kPublic);
      const uniqueKPublics = new Set(kPublics);
      expect(uniqueKPublics.size).toBe(kPublics.length);
    });

    it('should generate unique nonces — no duplicate kTwoPublic values', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      const [, body] = mockAxiosPost.mock.calls[0];
      const kTwoPublics = body.nonces.map(
        (n: { kTwoPublic: string }) => n.kTwoPublic,
      );
      const uniqueKTwoPublics = new Set(kTwoPublics);
      expect(uniqueKTwoPublics.size).toBe(kTwoPublics.length);
    });

    it('should call generatePublicNonce for each nonce (not reuse)', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      // Each nonce must be independently generated — reuse = key recovery
      expect(mockGeneratePublicNonce).toHaveBeenCalledTimes(50);

      // Verify each call returned a distinct object
      const results = mockGeneratePublicNonce.mock.results.map(
        (r) => r.value.kPublic,
      );
      const unique = new Set(results);
      expect(unique.size).toBe(50);
    });
  });

  // =========================================================================
  // Private key material must never leak
  // =========================================================================
  describe('Private nonce material isolation', () => {
    it('should never send private k to relay', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      const [, body] = mockAxiosPost.mock.calls[0];
      const bodyString = JSON.stringify(body);

      // Private nonce secrets must NEVER appear in relay payload
      for (const nonce of body.nonces) {
        expect(nonce).not.toHaveProperty('k');
        expect(nonce).not.toHaveProperty('kTwo');
      }
      // Double-check: the private values from our mock should not appear
      expect(bodyString).not.toContain('k_private_');
      expect(bodyString).not.toContain('kTwo_private_');
    });

    it('should store full nonces (including private k/kTwo) locally', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      let savedData: string | undefined;
      mockPassworderEncrypt.mockImplementation((_k, data) => {
        savedData = data;
        return `encrypted(${data})`;
      });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      expect(savedData).toBeDefined();
      const parsed = JSON.parse(savedData!);
      // Local storage must contain private material for signing
      for (const nonce of parsed) {
        expect(nonce).toHaveProperty('k');
        expect(nonce).toHaveProperty('kTwo');
        expect(nonce).toHaveProperty('kPublic');
        expect(nonce).toHaveProperty('kTwoPublic');
      }
    });

    it('should encrypt nonces before storing locally (never plaintext)', async () => {
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      await replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      // setItem should receive encrypted data, not raw JSON
      expect(mockSecureStorage.setItem).toHaveBeenCalledTimes(1);
      const [key, value] = mockSecureStorage.setItem.mock.calls[0];
      expect(key).toBe(STORAGE_KEY);
      // Our mock encryption wraps in "encrypted(...)"
      expect(value).toMatch(/^encrypted\(/);
    });
  });

  // =========================================================================
  // Error handling — graceful degradation
  // =========================================================================
  describe('Error handling — graceful degradation', () => {
    it('should not throw when loadEncryptedNonces encounters storage error', async () => {
      mockSecureStorage.getItem.mockImplementation(() => {
        throw new Error('Storage corrupted');
      });

      const result = await loadEncryptedNonces(FAKE_PASSWORD_BLOB);
      expect(result).toEqual([]);
    });

    it('should not throw when JSON.parse fails on corrupted data', async () => {
      mockSecureStorage.getItem.mockReturnValue('encrypted-garbage');
      mockPassworderDecrypt.mockImplementation((key: string) => {
        if (key === MOCK_FINGERPRINT) return FAKE_PASSWORD;
        return 'not-valid-json{{{';
      });

      const result = await loadEncryptedNonces(FAKE_PASSWORD_BLOB);
      expect(result).toEqual([]);
    });

    it('should handle concurrent replenish calls without crashing', async () => {
      // Both calls will see empty pool, both generate 50 nonces.
      // This tests that the function does not crash — actual dedup
      // is handled server-side via unique constraints.
      mockSecureStorage.getItem.mockReturnValue(null);
      mockAxiosPost.mockResolvedValue({ data: { status: 'success' } });

      const p1 = replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );
      const p2 = replenishWalletEnterpriseNonces(
        FAKE_WK_IDENTITY,
        FAKE_PASSWORD_BLOB,
      );

      // Neither should throw
      await expect(Promise.all([p1, p2])).resolves.toBeDefined();
    });
  });
});
