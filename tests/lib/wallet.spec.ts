/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck test suite
import chai from 'chai';
import sinon from 'sinon';
import httpMocks from 'node-mocks-http';
import axios from 'axios';
import utxolib from '@runonflux/utxo-lib';

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

const { expect, assert } = chai;

const rawTxFlux = "0400008085202f89016bf2b6449710be3300c3cc4a9ad2d4db7e88cea56168c46a16278b496e3415eb0000000092000047304402204d287d270c0d35e7c65f2b0f02b2ba8ca75e04934051691445115beb729beb54022060f01fcbf92957eb17d8a221a7d062a1fe5c86114deaf69bec99b65edafb82f201475221022a316c22acf16a9108b57f48802143cc0c0ac4b8fc360a87568e1794e51558752103749c957461154dfca921d0872ba3c9ac85d98c92e4a34fdac32bd03597fbd2f252aeffffffff02608501000000000017a914c9a895ceb2368f39686f8c77f6bc8c148ae6d54e870000000000000000136a1174657374207061796d656e74206e6f746500000000f7071a000000000000000000000000";
const mnemonic = "silver trouble mountain crouch angry park film strong escape theory illegal bunker cargo taxi tuna real drift alert state match great escape option explain";

describe('Wallet Lib', () => {
  describe('Verifies wallet', () => {
    afterEach(function() {
      sinon.restore();
    });

    it('should return getLibId data when value is flux', async () => {
        const res = await getLibId('flux');
        assert.equal(res,'flux');
    });

    it('should return getLibId data when value is evm', async () => {
      const res = await getLibId('sepolia');
      assert.equal(res,'sepolia');
    });

    it('should return getScriptType data when value is p2sh', async () => {
      const res = await getScriptType('p2sh');
      assert.equal(res, 0);
    });

    it('should return getScriptType data when value is p2sh-p2wsh', async () => {
      const res = await getScriptType('p2sh-p2wsh');
      assert.equal(res, 1);
    });

    it('should return getScriptType data when value is p2wsh', async () => {
      const res = await getScriptType('p2wsh');
      assert.equal(res, 2);
    });

    it('should return getScriptType data when value is empty', async () => {
      const res = await getScriptType('');
      assert.equal(res, 0);
    });

    it('should return generateMnemonic data when value is valid 256', async () => {
      const res = await generateMnemonic(256);
      const response = await validateMnemonic(res);
      const arr = res.split(" ");
      assert.equal(response, true);
      assert.equal(arr.length, 24);
    });

    it('should return generateMnemonic data when value is valid 128', async () => {
      const res = await generateMnemonic(128);
      const response = await validateMnemonic(res);
      const arr = res.split(" ");
      assert.equal(response, true);
      assert.equal(arr.length, 12);
    });

    it('should return getMasterXpub data when value is valid', async () => {
      const res = await getMasterXpub(
        mnemonic, 
        48,
        1, 
        0,
        'p2sh',
        "flux"
      );
      assert.equal(res, "xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5");
    });

    it('should return getMasterXpriv data when value is valid', async () => {
      const res = await getMasterXpriv(
        mnemonic, 
        48,
        1, 
        0,
        'p2sh',
        "flux"
      );
      assert.equal(res, "xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY");
    });

    it('should return generateMultisigAddress data when value is valid', async () => {
      const res = await generateMultisigAddress(
        "xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5", 
        "xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY",
        0, 
        1,
        "flux"
      );
      assert.deepEqual(res, 
        {
          address: 't3aBF8ML2AJgXuW93Gp9MUs3YcQ8DkFQ2B5',
          redeemScript: '52210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da210313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da52ae'
        }
      );
    });

    it('should return deriveEVMPublicKey data when value is valid', async () => {
      const res = await deriveEVMPublicKey(
        "xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5", 
        0, 
        1,
        "flux"
      );
      assert.equal(res, "0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da");
    });

    it('should return generateMultisigAddressEVM data when value is valid', async () => {
      const res = await generateMultisigAddressEVM(
        "xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5", 
        "xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY",
        0, 
        1,
        "sepolia"
      );
      assert.deepEqual(res, { address: '0x28FF9c641b4294bb4Dab37Dc983dB8fD6ABfBA61' });
    });

    it('should return generateAddressKeypairEVM data when value is valid', async () => {
      const res = await generateAddressKeypairEVM(
        "xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY",
        0, 
        1,
        "sepolia"
      );
      assert.deepEqual(res, 
        {
          privKey: '0x29c6fbfe8f749d4d122a3a8422e63977aaf943fb3674a927fb88f1a2833a53ad',
          pubKey: '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da'
        }
      )
    });

    it('should return generateAddressKeypair data when value is valid', async () => {
      const res = await generateAddressKeypair(
        "xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY",
        0, 
        1,
        "flux"
      );
      assert.deepEqual(res, 
        {
          privKey: 'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU',
          pubKey: '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da'
        }
      )
    });

    it('should return generateInternalIdentityAddress data when value is valid', async () => {
      const res = await generateInternalIdentityAddress(
        "xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5",
        "flux"
      );
      assert.equal(res, "t1UMukPYoA7hUn9GftBmHYF78Nwx6KErRBC");
    });

    it('should return generateExternalIdentityAddress data when value is valid', async () => {
      const res = await generateExternalIdentityAddress(
        "xpub6DrK6ePttTnvR7NRoCkLEYRdNHb8y5oRbzJLeDCv8dCcGJ3yamC9y37iKpAdUnyjmeb6wphWTTRpWFHPdTe8hUDkCUN7YXM5M834FmHr9K5",
      );
      assert.equal(res, "1BkaXDqox2YqXoC9qiyJpwgKP3z1QTD8yP");
    });

    it('should return generateNodeIdentityKeypair data when value is valid', async () => {
      const res = await generateNodeIdentityKeypair(
        "xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY",
        0, 
        1,
        "flux"
      );
      assert.deepEqual(res, 
        {
          privKey: 'KxcvLgMARzhsH9ttJvxFC56aCNeYviVwN3GKXamhJb5PCPyYy6eU',
          pubKey: '0313b0012725426394a61c44a0ec4be91be554d1625d97ee6565db61b30500f8da'
        }
      );
    });

    it('should return generateExternalIdentityKeypair data when value is valid', async () => {
      const res = await generateExternalIdentityKeypair(
        "xprv9zrxh8s146EdCdHxhBDKsQUtpFkeZd5aEmNjqpoJaHfdPViq3DsuREoEUX4hdmp6E4mMR2CbN5xBVYnx1jfhAADwwm1jrtMVicif7TEWjQY",
      );
      assert.deepEqual(res, 
        {
          privKey: 'L1JnbAY7VWB6UwfzUa892MN55p1Fnhikpko2jxkVPtAn6DoJVCJE',
          pubKey: '020e2cade92e0e199e6833e0081943a0e5226344b8bf17357a406a80ed762a5747',
          address: '1BkaXDqox2YqXoC9qiyJpwgKP3z1QTD8yP'
        }
      );
    });

    it('should return wifToPrivateKey data when value is valid', async () => {
      const res = await wifToPrivateKey(
        "L1JnbAY7VWB6UwfzUa892MN55p1Fnhikpko2jxkVPtAn6DoJVCJE", "flux"
      );
      assert.equal(res, "79f5fa33b9335881fa34434246beb41bd63a5c186546bcdf333e2923ef565e0f");
    });

  });
});