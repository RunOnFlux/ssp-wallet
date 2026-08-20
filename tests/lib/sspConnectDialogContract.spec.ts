import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * Contract for the SSP Connect request dialogs.
 *
 * Every dialog SspConnect renders stays mounted for the whole session and is
 * fed from one shared set of state slots, so a dialog's props hold whatever
 * the *previous* request put there. A Flux payment proposal fills the
 * `recipients` slot with `{address, amount}` objects; FluxNodeStart reads the
 * same slot as delegate public keys and called `.slice()` on each entry, which
 * crashed the whole extension ("I.slice is not a function") the moment any
 * vault payment proposal arrived. Two independent guards keep that shut:
 * the dialogs render nothing while closed, and the delegate list is parsed as
 * strings only.
 */

const read = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

describe('SSP Connect dialogs — stale shared props', () => {
  it.each([
    'components/FluxNodeStart/FluxNodeStart.tsx',
    'components/EnterpriseFluxNodeStart/EnterpriseFluxNodeStart.tsx',
  ])('%s renders nothing while closed', (path) => {
    const source = read(path);
    expect(source).toContain('if (!open) return null;');
    // The guard has to sit ahead of the JSX that reads the shared props.
    expect(source.indexOf('if (!open) return null;')).toBeLessThan(
      source.indexOf('<Modal'),
    );
  });

  it('parses delegates as strings only, for both node-start dialogs', () => {
    const source = read('components/SspConnect/SspConnect.tsx');
    expect(source).toContain("typeof d === 'string'");
    expect(
      source.match(/delegates=\{parseDelegates\(recipients\)\}/g),
    ).toHaveLength(2);
    // No dialog may take the raw JSON parse of the shared recipients slot.
    expect(source).not.toContain('JSON.parse(recipients) as string[]');
  });
});
