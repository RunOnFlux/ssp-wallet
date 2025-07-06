// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import { describe, it, expect } from 'vitest';

import {
  getLibId,
  getScriptType,
  generateMnemonic,
  validateMnemonic,
  getMasterXpub,
  getMasterXpriv,
  generateMultisigAddress,
  deriveEVMPublicKey,
  generateMultisigAddressEVM,
  generateAddressKeypairEVM,
  generateAddressKeypair,
  generateInternalIdentityAddress,
  generateExternalIdentityAddress,
  generateNodeIdentityKeypair,
  generateExternalIdentityKeypair,
  wifToPrivateKey,
} from '../../src/lib/wallet';

const mnemonic =
  'silver trouble mountain crouch angry park film strong escape theory illegal bunker cargo taxi tuna real drift alert state match great escape option explain';

describe('Wallet Lib', () => {
  describe('Verifies wallet', () => {
    it('should return getLibId data when value is flux', () => {
      const res = getLibId('flux');
      expect(res).toBe('flux');
    });

    it('should return getLibId data when value is evm', () => {
      const res = getLibId('sepolia');
      expect(res).toBe('sepolia');
    });

    it('should return getScriptType data when value is p2sh', () => {
      const res = getScriptType('p2sh');
      expect(res).toBe(0);
    });

    it('should return getScriptType data when value is p2sh-p2wsh', () => {
      const res = getScriptType('p2sh-p2wsh');
      expect(res).toBe(1);
    });

    it('should return getScriptType data when value is p2wsh', () => {
      const res = getScriptType('p2wsh');
      expect(res).toBe(2);
    });

    it('should return getScriptType data when value is empty', () => {
      const res = getScriptType('');
      expect(res).toBe(0);
    });

    it('should return generateMnemonic data when value is valid 256', () => {
      const res = generateMnemonic(256);
      const response = validateMnemonic(res);
      const arr = res.split(' ');
      expect(response).toBe(true);
      expect(arr.length).toBe(24);
    });

    it('should return generateMnemonic data when value is valid 128', () => {
      const res = generateMnemonic(128);
      const response = validateMnemonic(res);
      const arr = res.split(' ');
      expect(response).toBe(true);
      expect(arr.length).toBe(12);
    });

    it('should return getMasterXpub data when value is valid', () => {
      const res = getMasterXpub(mnemonic, 48, 1, 0, 'p2sh', 'flux');
      expect(res).toBe(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
      );
    });

    it('should return getMasterXpriv data when value is valid', () => {
      const res = getMasterXpriv(mnemonic, 48, 1, 0, 'p2sh', 'flux');
      expect(res).toBe(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
      );
    });

    it('should return generateMultisigAddress data when value is valid', () => {
      const res = generateMultisigAddress(
        'xpub6E6y9tsLuio8LW27A6pxhQqB9vzt6WF2fe19zy324QxV2dp5yeWtqf3FFRS3WiYczXa2kLTbhL2xqCv3BwXtxcHxV1N44rB7oDhPkXFcCT7',
        'xpub6E8eBHSZFjATHvJ8aoHvP23qGwpdKyhQ5DL6v8mLqKs5FNXcFSKA3xb3Y3iPmz4XuS1FCjRLoWSTj7ND4de7aq8PW6HC5QtEaX6VHBMt5rQ',
        0,
        1,
        'flux',
      );
      expect(res).toEqual({
        address: 't3cwthwVvGg7WKkxhzw87xnDDsdb9kS92x3',
        redeemScript:
          '522102410c09afd939c64158ef6cba254563915c92e6b7433a99ce02f243dee58247eb2103d9ad2faadb658df6093c7d5e16b6b2df0fa921ed0bbd1c23f186c43bf8e9678c52ae',
      });
    });

    it('should return deriveEVMPublicKey data when value is valid', () => {
      const res = deriveEVMPublicKey(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        0,
        1,
        'flux',
      );
      expect(res).toBe(
        '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      );
    });

    it('should return generateMultisigAddressEVM data when value is valid', () => {
      const res = generateMultisigAddressEVM(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        'xpub6ETBdcdqUeW4C8fNDih4jT8ucXJFsefgx7RUYDCuBRd9Gnb2KVgKqbmZxNYPbnmqpfW1k3UEkvN2Y4mZEy254Es7XyrRy2cV4ungMRG1gNc',
        0,
        1,
        'sepolia',
      );
      expect(res).toEqual({
        address: '0xa0597a53B8D2601D9dd2354AC59d82Da1b2c831C',
      });
    });

    it('should return generateAddressKeypairEVM data when value is valid', () => {
      const res = generateAddressKeypairEVM(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'sepolia',
      );
      expect(res).toEqual({
        privKey:
          '0x29c6fbfe8f749d4d122a3a8422e63977aaf943fb3674a927fb88f1a2833a53ad',
        pubKey:
          '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      });
    });

    it('should return generateAddressKeypair data when value is valid', () => {
      const res = generateAddressKeypair(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'flux',
      );
      expect(res).toEqual({
        privKey: 'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU',
        pubKey:
          '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      });
    });

    it('should return generateInternalIdentityAddress data when value is valid', () => {
      const res = generateInternalIdentityAddress(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        'flux',
      );
      expect(res).toBe('t1UMukPYoA7hUn9GftBmHYF78Nwx6KErRBC');
    });

    it('should return generateExternalIdentityAddress data when value is valid', () => {
      const res = generateExternalIdentityAddress(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
      );
      expect(res).toBe('1BkaXDqox2YqXoC9qiyJpwgKP3z1QTD8yP');
    });

    it('should return generateNodeIdentityKeypair data when value is valid', () => {
      const res = generateNodeIdentityKeypair(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'flux',
      );
      expect(res).toEqual({
        privKey: 'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU',
        pubKey:
          '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      });
    });

    it('should return generateExternalIdentityKeypair data when value is valid', () => {
      const res = generateExternalIdentityKeypair(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
      );
      expect(res).toEqual({
        address: '1BkaXDqox2YqXoC9qiyJpwgKP3z1QTD8yP',
        privKey: 'L1JnbAY7VWB6UwfzUa892MN55p1Fnhikpko2jxkVPtAn6DoJVCJE',
        pubKey:
          '020e2cade92e0e199e6833e0081943a0e5226344b8bf17357a406a80ed762a5747',
      });
    });

    it('should return wifToPrivateKey data when value is valid', () => {
      const res = wifToPrivateKey(
        'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU',
        'flux',
      );
      expect(res).toBe(
        '29c6fbfe8f749d4d122a3a8422e63977aaf943fb3674a927fb88f1a2833a53ad',
      );
    });
  });
});
