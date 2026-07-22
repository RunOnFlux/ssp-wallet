/**
 * Pairing verification code — the out-of-band cross-check that defeats a
 * malicious relay swapping extended keys during sync.
 *
 * THREAT: the relay carries the key material between Wallet and Key. An
 * adversarial relay could substitute the Key's extended public key with its
 * own, so the Wallet derives a 2-of-2 vault the user does not fully control.
 * The echo checks in the sync flow are defeatable because the relay produces
 * the whole document.
 *
 * DEFENCE: both devices independently derive a short code from THEIR OWN view
 * of the two extended keys and show it to the user, who confirms the codes
 * match. Because each device hashes the actual key pair it holds, any relay
 * substitution makes the two codes differ. This is out-of-band (human eyeball)
 * verification the relay cannot forge.
 *
 * SECURITY LEVEL: 6 BIP39 words = 66 bits. To pass undetected the relay would
 * need an extended key whose code collides with the genuine one — a ~2^66
 * grind, infeasible. This function is DISPLAY-ONLY; it never touches signing,
 * derivation, or the vault. It must stay byte-identical to ssp-key's copy
 * (verified by a cross-repo parity test).
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const WORDS = 6; // 6 * 11 = 66 bits

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * Read `count` 11-bit big-endian chunks from a byte array → BIP39 words.
 *
 * `acc` holds the unconsumed bit buffer. We must (a) top it up with WHOLE bytes
 * until it has ≥11 bits — a `while`, not an `if`, or short reads produce
 * negative shifts — and (b) mask off the consumed high bits after each word so
 * `acc` never grows past 32 bits (JS bitwise ops truncate to int32, which would
 * silently corrupt the stream and collapse the entropy).
 */
function bitsToWords(bytes: Uint8Array, count: number): string[] {
  const out: string[] = [];
  let acc = 0;
  let bits = 0;
  let i = 0;
  while (out.length < count) {
    while (bits < 11) {
      acc = (acc << 8) | (bytes[i] ?? 0);
      i += 1;
      bits += 8;
    }
    bits -= 11;
    const index = (acc >> bits) & 0x7ff; // top 11 bits
    acc &= (1 << bits) - 1; // keep only the unconsumed low bits
    out.push(wordlist[index]);
  }
  return out;
}

/**
 * Canonical single-pair code. `chain` binds the code to the specific vault so
 * a key valid on one chain can't be replayed onto another.
 */
export function verificationWords(
  walletXpub: string,
  keyXpub: string,
  chain: string,
): string[] {
  const a = walletXpub.trim();
  const b = keyXpub.trim();
  // Sort so Wallet and Key agree regardless of which value each calls its own.
  const [x, y] = a <= b ? [a, b] : [b, a];
  const digest = sha256(utf8(`ssp-verify\n${x}\n${y}\n${chain}`));
  return bitsToWords(digest, WORDS);
}

/**
 * Aggregate code over many chains (batch sync). One comparison covers every
 * synced chain; a relay swap on ANY chain changes the aggregate. Entries are
 * sorted by chain so both devices produce the same order.
 */
export function batchVerificationWords(
  entries: { chain: string; walletXpub: string; keyXpub: string }[],
): string[] {
  const lines = entries
    .map(({ chain, walletXpub, keyXpub }) => {
      const a = walletXpub.trim();
      const b = keyXpub.trim();
      const [x, y] = a <= b ? [a, b] : [b, a];
      return `${chain}\n${x}\n${y}`;
    })
    .sort();
  const digest = sha256(utf8(`ssp-verify-batch\n${lines.join('\n')}`));
  return bitsToWords(digest, WORDS);
}

/** Convenience: the words as a single spaced string. */
export function verificationCode(
  walletXpub: string,
  keyXpub: string,
  chain: string,
): string {
  return verificationWords(walletXpub, keyXpub, chain).join(' ');
}
