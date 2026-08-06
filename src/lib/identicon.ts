/**
 * Deterministic identicon data — a 5x5 horizontally-symmetric colored grid
 * derived from any identity string (address, wkIdentity, xpub, ...).
 *
 * Purely visual: the SAME identity always renders the SAME pattern, so a user
 * can spot at a glance when a "familiar" address is actually a different one
 * (anti address-poisoning affordance). Not a security boundary on its own.
 *
 * EXACT port of ssp-key/ssp-enterprise-app src/lib/identicon.ts — the algorithm must stay
 * byte-for-byte identical so the same wkIdentity/address renders the same
 * identicon on the phone, the enterprise app, and this extension. Rendering
 * happens in components/Identicon/Identicon.tsx via inline SVG.
 */

export const IDENTICON_GRID = 5;

export interface IdenticonData {
  /** Fill color for active cells (hsl string). */
  color: string;
  /** Row-major 5x5 grid, mirrored around the center column. */
  cells: boolean[];
}

/** FNV-1a 32-bit hash. */
function fnv1a(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (FNV prime), in 32-bit space
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** xorshift32 PRNG — deterministic bit stream from the hash seed. */
function xorshift32(state: number): number {
  let x = state >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

export function identiconData(value: string): IdenticonData {
  // Normalize so visually-identical identities map together regardless of
  // hex casing (EIP-55 checksummed vs lowercased address).
  const normalized = value.trim().toLowerCase();
  const seed = fnv1a(normalized) || 1; // xorshift must not start at 0

  // Hue from an independent hash pass so color and pattern are uncorrelated.
  const hue = fnv1a(normalized, 0x9e3779b9) % 360;
  const color = `hsl(${String(hue)}, 62%, 52%)`;

  // 5 rows x 3 independent columns (left half + center), mirrored.
  const half = Math.ceil(IDENTICON_GRID / 2); // 3
  const cells: boolean[] = new Array<boolean>(
    IDENTICON_GRID * IDENTICON_GRID,
  ).fill(false);
  let state = seed;
  let anyActive = false;
  for (let row = 0; row < IDENTICON_GRID; row += 1) {
    for (let col = 0; col < half; col += 1) {
      state = xorshift32(state);
      const active = state % 2 === 1;
      if (active) {
        anyActive = true;
        cells[row * IDENTICON_GRID + col] = true;
        cells[row * IDENTICON_GRID + (IDENTICON_GRID - 1 - col)] = true;
      }
    }
  }
  if (!anyActive) {
    // Never render a fully blank identicon.
    const center = Math.floor((IDENTICON_GRID * IDENTICON_GRID) / 2);
    cells[center] = true;
  }
  return { color, cells };
}
