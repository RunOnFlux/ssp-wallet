/**
 * Address display helpers — middle truncation with emphasized ends.
 *
 * Anti address-poisoning rendering: poisoned lookalike addresses usually match
 * a few leading/trailing characters, so we emphasize a LONG prefix/suffix
 * (6 chars each) and de-emphasize (never hide behind a single glyph) the
 * middle. The full address stays available on copy/expand.
 *
 * Port of ssp-key's src/lib/addressDisplay.ts — kept identical so addresses
 * truncate the same way on every SSP surface.
 */

export interface AddressParts {
  start: string;
  middle: string;
  end: string;
}

export const ADDRESS_EDGE_CHARS = 6;

/**
 * Split an address into emphasized start/end and a de-emphasized middle.
 * Short strings are returned whole in `start` (no fake truncation).
 */
export function splitAddressForDisplay(
  address: string,
  edge: number = ADDRESS_EDGE_CHARS,
): AddressParts {
  const value = address.trim();
  if (value.length <= edge * 2 + 3) {
    return { start: value, middle: '', end: '' };
  }
  return {
    start: value.slice(0, edge),
    middle: value.slice(edge, value.length - edge),
    end: value.slice(value.length - edge),
  };
}

/** Compact single-string form: `0x8f3C…9A063`. */
export function truncateAddress(
  address: string,
  edge: number = ADDRESS_EDGE_CHARS,
): string {
  const parts = splitAddressForDisplay(address, edge);
  if (!parts.middle) {
    return parts.start;
  }
  return `${parts.start}…${parts.end}`;
}
