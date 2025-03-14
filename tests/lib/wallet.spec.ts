/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck test suite

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
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'flux',
      );
      expect(res).toEqual({
        address: 't3aBF8ML2AJgXuW93Gp9MUs3YcQ8DkFQ2B5',
        redeemScript:
          '52210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da52ae',
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
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'sepolia',
      );
      expect(res).toEqual({
        address: '0x388FBa75f0b18566CfeFf56d641e1A30f1655076',
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
        address: '0x388FBa75f0b18566CfeFf56d641e1A30f1655076',
        privateKey:
          '0x0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
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
        address: 't1cjcLaDHkNcuXh6uoyNL7u1jx7GxvzfYAN',
        privateKey: 'L1Eo9rvxdPDTDQHiWVxSCDYEcnDPDHzWgQbEYJ9V1y8DWVPDLbso',
      });
    });

    it('should return generateInternalIdentityAddress data when value is valid', () => {
      const res = generateInternalIdentityAddress(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        0,
        1,
        'flux',
      );
      expect(res).toBe('t1cjcLaDHkNcuXh6uoyNL7u1jx7GxvzfYAN');
    });

    it('should return generateExternalIdentityAddress data when value is valid', () => {
      const res = generateExternalIdentityAddress(
        'xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5',
        0,
        1,
        'flux',
      );
      expect(res).toBe('t1cjcLaDHkNcuXh6uoyNL7u1jx7GxvzfYAN');
    });

    it('should return generateNodeIdentityKeypair data when value is valid', () => {
      const res = generateNodeIdentityKeypair(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'flux',
      );
      expect(res).toEqual({
        address: 't1cjcLaDHkNcuXh6uoyNL7u1jx7GxvzfYAN',
        privateKey: 'L1Eo9rvxdPDTDQHiWVxSCDYEcnDPDHzWgQbEYJ9V1y8DWVPDLbso',
      });
    });

    it('should return generateExternalIdentityKeypair data when value is valid', () => {
      const res = generateExternalIdentityKeypair(
        'xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY',
        0,
        1,
        'flux',
      );
      expect(res).toEqual({
        address: 't1cjcLaDHkNcuXh6uoyNL7u1jx7GxvzfYAN',
        privateKey: 'L1Eo9rvxdPDTDQHiWVxSCDYEcnDPDHzWgQbEYJ9V1y8DWVPDLbso',
      });
    });

    it('should return wifToPrivateKey data when value is valid', () => {
      const res = wifToPrivateKey(
        'L1Eo9rvxdPDTDQHiWVxSCDYEcnDPDHzWgQbEYJ9V1y8DWVPDLbso',
      );
      expect(res).toBe(
        '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da',
      );
    });
  });
});
