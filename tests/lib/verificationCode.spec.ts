import { describe, it, expect } from 'vitest';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import {
  verificationWords,
  batchVerificationWords,
  verificationCode,
  recoveryVerificationWords,
} from '../../src/lib/verificationCode';

// Two format-valid xpubs that differ only in their tail — enough for the
// pairing cross-check, which hashes the full strings.
const WALLET_XPUB =
  'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz';
const KEY_XPUB =
  'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDABC';

const wordSet = new Set(wordlist);

describe('verificationCode', () => {
  describe('verificationWords', () => {
    it('is deterministic — same inputs always yield the same words', () => {
      const a = verificationWords(WALLET_XPUB, KEY_XPUB, 'btc');
      const b = verificationWords(WALLET_XPUB, KEY_XPUB, 'btc');
      expect(a).toEqual(b);
    });

    it('is sort-invariant — swapping wallet/key order yields the same code', () => {
      expect(verificationWords(WALLET_XPUB, KEY_XPUB, 'btc')).toEqual(
        verificationWords(KEY_XPUB, WALLET_XPUB, 'btc'),
      );
    });

    it('produces exactly 6 words, all from the BIP39 english wordlist', () => {
      const words = verificationWords(WALLET_XPUB, KEY_XPUB, 'btc');
      expect(words).toHaveLength(6);
      for (const word of words) {
        expect(wordSet.has(word)).toBe(true);
      }
    });

    it('binds the code to the chain — a different chain gives a different code', () => {
      const btc = verificationWords(WALLET_XPUB, KEY_XPUB, 'btc');
      const eth = verificationWords(WALLET_XPUB, KEY_XPUB, 'eth');
      expect(btc).not.toEqual(eth);
    });

    it('matches a fixed known vector (guards against accidental algorithm change)', () => {
      expect(verificationWords(WALLET_XPUB, KEY_XPUB, 'btc')).toEqual([
        'sense',
        'tackle',
        'work',
        'recipe',
        'twelve',
        'inmate',
      ]);
      expect(verificationWords(WALLET_XPUB, KEY_XPUB, 'eth')).toEqual([
        'price',
        'want',
        'left',
        'danger',
        'rely',
        'rack',
      ]);
    });
  });

  describe('verificationCode', () => {
    it('is the words joined by spaces', () => {
      const words = verificationWords(WALLET_XPUB, KEY_XPUB, 'btc');
      expect(verificationCode(WALLET_XPUB, KEY_XPUB, 'btc')).toBe(
        words.join(' '),
      );
    });
  });

  describe('batchVerificationWords', () => {
    const entries = [
      { chain: 'btc', walletXpub: WALLET_XPUB, keyXpub: KEY_XPUB },
      { chain: 'eth', walletXpub: WALLET_XPUB, keyXpub: KEY_XPUB },
    ];

    it('produces exactly 6 words, all from the BIP39 english wordlist', () => {
      const words = batchVerificationWords(entries);
      expect(words).toHaveLength(6);
      for (const word of words) {
        expect(wordSet.has(word)).toBe(true);
      }
    });

    it('is order-invariant — reversed entries yield the same code', () => {
      expect(batchVerificationWords(entries)).toEqual(
        batchVerificationWords([...entries].reverse()),
      );
    });

    it('differs from the single-chain code (batch domain separation)', () => {
      expect(batchVerificationWords(entries)).not.toEqual(
        verificationWords(WALLET_XPUB, KEY_XPUB, 'btc'),
      );
    });

    it('matches a fixed known vector (guards against accidental algorithm change)', () => {
      expect(batchVerificationWords(entries)).toEqual([
        'sea',
        'sight',
        'tackle',
        'marriage',
        'trumpet',
        'razor',
      ]);
    });
  });
  describe('recoveryVerificationWords', () => {
    const PK_EPH = '02' + 'ab'.repeat(32);
    const NONCE = 'cd'.repeat(16);

    it('is deterministic and yields six wordlist words', () => {
      const words = recoveryVerificationWords(PK_EPH, NONCE);
      expect(words).toHaveLength(6);
      words.forEach((word) => expect(wordSet.has(word)).toBe(true));
      expect(recoveryVerificationWords(PK_EPH, NONCE)).toEqual(words);
    });

    it('changes when either field is substituted', () => {
      const words = recoveryVerificationWords(PK_EPH, NONCE);
      expect(
        recoveryVerificationWords('03' + 'ab'.repeat(32), NONCE),
      ).not.toEqual(words);
      expect(recoveryVerificationWords(PK_EPH, 'ce'.repeat(16))).not.toEqual(
        words,
      );
    });

    it('tolerates casing and surrounding whitespace', () => {
      expect(
        recoveryVerificationWords(
          ` ${PK_EPH.toUpperCase()} `,
          ` ${NONCE.toUpperCase()} `,
        ),
      ).toEqual(recoveryVerificationWords(PK_EPH, NONCE));
    });

    it('is NOT order-invariant — the two fields play different roles', () => {
      expect(recoveryVerificationWords(NONCE, PK_EPH)).not.toEqual(
        recoveryVerificationWords(PK_EPH, NONCE),
      );
    });

    it('is domain-separated from the pairing codes', () => {
      expect(recoveryVerificationWords(PK_EPH, NONCE)).not.toEqual(
        verificationWords(PK_EPH, NONCE, 'recovery'),
      );
    });

    it('matches a fixed known vector (cross-repo parity)', () => {
      expect(recoveryVerificationWords(PK_EPH, NONCE)).toEqual([
        'immense',
        'laundry',
        'snake',
        'naive',
        'spring',
        'turn',
      ]);
    });
  });
});
