// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import { describe, it } from 'mocha';

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

const { assert } = chai;

const mnemonic =
  'silver trouble mountain crouch angry park film strong escape theory illegal bunker cargo taxi tuna real drift alert state match great escape option explain';

describe('Wallet Lib', function () {
  describe('Verifies wallet', function () {
    it('should return getLibId data when value is flux', function () {
      const res = getLibId('flux');
      assert.equal(res, 'flux');
    });

    it('should return getLibId data when value is evm', function () {
      const res = getLibId('sepolia');
      assert.equal(res, 'sepolia');
    });

    it('should return getScriptType data when value is p2sh', function () {
      const res = getScriptType('p2sh');
      assert.equal(res, 0);
    });

    it('should return getScriptType data when value is p2sh-p2wsh', function () {
      const res = getScriptType('p2sh-p2wsh');
      assert.equal(res, 1);
    });

    it('should return getScriptType data when value is p2wsh', function () {
      const res = getScriptType('p2wsh');
      assert.equal(res, 2);
    });

    it('should return getScriptType data when value is empty', function () {
      const res = getScriptType('');
      assert.equal(res, 0);
    });

    it('should return generateMnemonic data when value is valid 256', function () {
      const res = generateMnemonic(256);
      const response = validateMnemonic(res);
      const arr = res.split(' ');
      assert.equal(response, true);
      assert.equal(arr.length, 24);
    });

    it('should return generateMnemonic data when value is valid 128', function () {
      const res = generateMnemonic(128);
      const response = validateMnemonic(res);
      const arr = res.split(' ');
      assert.equal(response, true);
      assert.equal(arr.length, 12);
    });

    it('should return getMasterXpub data when value is valid', function () {
      const res = getMasterXpub(mnemonic, 48, 1, 0, 'p2sh', 'flux');
      assert.equal(
        res,
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
      );
    });

    it('should return getMasterXpriv data when value is valid', function () {
      const res = getMasterXpriv(mnemonic, 48, 1, 0, 'p2sh', 'flux');
      assert.equal(
        res,
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
      );
    });

    it('should return generateMultisigAddress data when value is valid', function () {
      const res = generateMultisigAddress(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'flux',
      );
      assert.deepEqual(res, {
        address: 't3aBF8ML2AJgXuW93Gp9MUs3YcQ8DkFQ2B5',
        redeemScript:
          '52210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da52ae',
      });
    });

    it('should return deriveEVMPublicKey data when value is valid', function () {
      const res = deriveEVMPublicKey(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        0,
        1,
        'flux',
      );
      assert.equal(
        res,
        '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      );
    });

    it('should return generateMultisigAddressEVM data when value is valid', function () {
      const res = generateMultisigAddressEVM(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'sepolia',
      );
      assert.deepEqual(res, {
        address: '0x388FBa75f0b18566CfeFf56d641e1A30f1655076',
      });
    });

    it('should return generateAddressKeypairEVM data when value is valid', function () {
      const res = generateAddressKeypairEVM(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'sepolia',
      );
      assert.deepEqual(res, {
        privKey:
          '0x29c6fbfe8f749d4d122a3a8422e63977aaf943fb3674a927fb88f1a2833a53ad',
        pubKey:
          '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      });
    });

    it('should return generateAddressKeypair data when value is valid', function () {
      const res = generateAddressKeypair(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'flux',
      );
      assert.deepEqual(res, {
        privKey: 'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU',
        pubKey:
          '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      });
    });

    it('should return generateInternalIdentityAddress data when value is valid', function () {
      const res = generateInternalIdentityAddress(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        'flux',
      );
      assert.equal(res, 't1UMukPYoA7hUn9GftBmHYF78Nwx6KErRBC');
    });

    it('should return generateExternalIdentityAddress data when value is valid', function () {
      const res = generateExternalIdentityAddress(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
      );
      assert.equal(res, '1BkaXDqox2YqXoC9qiyJpwgKP3z1QTD8yP');
    });

    it('should return generateNodeIdentityKeypair data when value is valid', function () {
      const res = generateNodeIdentityKeypair(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'flux',
      );
      assert.deepEqual(res, {
        privKey: 'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU',
        pubKey:
          '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      });
    });

    it('should return generateExternalIdentityKeypair data when value is valid', function () {
      const res = generateExternalIdentityKeypair(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
      );
      assert.deepEqual(res, {
        privKey: 'L1JnbAY7VWB6UwfzUa892MN55p1Fnhikpko2jxkVPtAn6DoJVCJE',
        pubKey:
          '020e2cade92e0e199e6833e0081943a0e5226344b8bf17357a406a80ed762a5747',
        address: '1BkaXDqox2YqXoC9qiyJpwgKP3z1QTD8yP',
      });
    });

    it('should return wifToPrivateKey data when value is valid', function () {
      const res = wifToPrivateKey(
        'L1JnbAY7VWB6UwfzUa892MN55p1Fnhikpko2jxkVPtAn6DoJVCJE',
        'flux',
      );
      assert.equal(
        res,
        '79f5fa33b9335881fa34434246beb41bd63a5c186546bcdf333e2923ef565e0f',
      );
    });
  });
});
