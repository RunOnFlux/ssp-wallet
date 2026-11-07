import { describe, it, expect } from 'vitest';
import { exchangeLimits } from '../../src/lib/abeLimits';
import { abeAsset } from '../../src/types';

const base = { idzelcore: 'bitcoin', name: 'Bitcoin', ticker: 'BTC', chain: 0 };

describe('abeLimits', () => {
  it('reads every exchange limit ABE sends, including ones the wallet has never heard of', () => {
    const asset = {
      ...base,
      idexolixfloat: 'BTC_BTC',
      idexolixfloatlimit: ['ethereum'],
      idinstaswapprivate: 'btc.btc',
      idinstaswapprivatelimit: null,
      idsomefutureexchange: 'x',
      idsomefutureexchangelimit: ['litecoin'],
    } as abeAsset;
    expect(exchangeLimits(asset)).toEqual([['ethereum'], null, ['litecoin']]);
  });

  it('a null limit means every asset of that exchange — InstaSwap alone widens the pairs', () => {
    const asset = {
      ...base,
      idinstaswapfloat: 'btc.btc',
      idinstaswapfloatlimit: null,
    } as abeAsset;
    expect(exchangeLimits(asset).some((limit) => limit === null)).toBe(true);
  });

  it('ignores client-signed exchanges ABE never quotes to SSP', () => {
    const asset = {
      ...base,
      idrangofloat: 'BTC.BTC',
      idrangofloatlimit: null,
      idbinanceweb3: '0xabc',
      idbinanceweb3limit: null,
    } as abeAsset;
    expect(exchangeLimits(asset)).toEqual([]);
  });

  it('ignores the id fields themselves and anything that is not a limit list', () => {
    const asset = {
      ...base,
      idchangellyfloat: 'btc',
      idchangellyfloatlimit: undefined,
    } as abeAsset;
    expect(exchangeLimits(asset)).toEqual([]);
  });
});
