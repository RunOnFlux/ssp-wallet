import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * A dependency-free spell gate over the English locale.
 *
 * The audit found six live typos in user-facing security and setup copy
 * ("Excersice caution" on the address-sharing consent screen, "has it's own" on
 * the seed-phrase warning, "open your SSP Key on our mobile phone"). Nothing
 * caught them: they are valid JSON, valid TypeScript and fully translated into
 * 30+ locales, so every existing gate was green.
 *
 * A full dictionary check would need a new dependency and would drown in
 * crypto vocabulary (xpub, multisig, satoshi, blockbook). This instead pins the
 * specific misspellings and grammar slips that actually shipped, plus the
 * classic confusables, so a regression fails the suite. Add to the list
 * whenever a typo is found in review rather than relying on the next reader.
 */

const LOCALE_DIR = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'translations',
  'resources',
  'en',
);

/** [pattern, what to write instead] — patterns are case-insensitive. */
const FORBIDDEN: [RegExp, string][] = [
  // Actually shipped in v2.0.0:
  [/\bexcersice\b/i, 'exercise'],
  [/\bsenstivie\b/i, 'sensitive'],
  [/\bhas it's own\b/i, 'has its own (possessive, not "it is")'],
  [/\bon our mobile phone\b/i, 'on your mobile phone'],
  // Classic confusables in this domain's copy:
  [/\brecieve/i, 'receive'],
  [/\bseperate/i, 'separate'],
  [/\boccured\b/i, 'occurred'],
  [/\bsuccesfully\b/i, 'successfully'],
  [/\btransation\b/i, 'transaction'],
  [/\baddres\b/i, 'address'],
  [/\bpublick\b/i, 'public'],
  [/\bavailible\b/i, 'available'],
  [/\blenght\b/i, 'length'],
  [/\bteh\b/i, 'the'],
  [/\byour welcome\b/i, "you're welcome"],
  [/\bits own seed\b.*\bit's\b/i, 'consistent possessive usage'],
];

/** Collect every string value in the locale, with a path for the failure text. */
function collectStrings(
  value: unknown,
  trail: string,
  out: { where: string; text: string }[],
): void {
  if (typeof value === 'string') {
    out.push({ where: trail, text: value });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(v, trail ? `${trail}.${k}` : k, out);
    }
  }
}

const entries: { where: string; text: string }[] = [];
for (const file of fs
  .readdirSync(LOCALE_DIR)
  .filter((f) => f.endsWith('.json'))) {
  const ns = path.basename(file, '.json');
  collectStrings(
    JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, file), 'utf8')),
    ns,
    entries,
  );
}

describe('English locale spelling', () => {
  it('reads every namespace', () => {
    // Sanity: if the loader silently found nothing, the checks below would pass
    // vacuously and the gate would be worthless.
    expect(entries.length).toBeGreaterThan(500);
  });

  it.each(FORBIDDEN)('never contains %s (use: %s)', (pattern, instead) => {
    const hits = entries
      .filter((e) => pattern.test(e.text))
      .map((e) => `${e.where}: "${e.text}"`);
    if (hits.length) {
      // Thrown rather than expect(hits, msg) — the message argument is a vitest
      // extension and this file is mirrored into ssp-key's jest suite.
      throw new Error(
        `Write "${instead}" instead. Found in:\n  ${hits.join('\n  ')}`,
      );
    }
  });

  it('never leaves a double space in user-facing copy', () => {
    const hits = entries
      .filter((e) => / {2}/.test(e.text))
      .map((e) => `${e.where}: "${e.text}"`);
    expect(hits).toEqual([]);
  });

  it('never ships an unresolved interpolation brace', () => {
    // e.g. "{{amount}" or "{amount}}" — renders literally to the user.
    const hits = entries
      .filter(
        (e) =>
          /\{\{[^}]*$|^[^{]*\}\}/.test(e.text) && !/\{\{[^}]+\}\}/.test(e.text),
      )
      .map((e) => `${e.where}: "${e.text}"`);
    expect(hits).toEqual([]);
  });
});
