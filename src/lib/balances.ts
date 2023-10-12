import axios from 'axios';
import BigNumber from 'bignumber.js';
import { balanceInsight, balanceBlockbook, balance } from '../types';

import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';

export async function fetchAddressBalance(
  address: string,
  chain: string,
): Promise<balance> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].backend === 'blockbook') {
      const url = `https://${backendConfig.node}/api/v2/address/${address}?details=basic`;
      const response = await axios.get<balanceBlockbook>(url);
      const bal: balance = {
        confirmed: response.data.balance,
        unconfirmed: response.data.unconfirmedBalance,
        address: response.data.address,
        totalTransactions: response.data.txs,
      };
      console.log(bal);
      return bal;
    } else {
      const url = `https://${backendConfig.node}/api/addr/${address}?noTxList=1`;
      const response = await axios.get<balanceInsight>(url);
      const bal: balance = {
        confirmed: new BigNumber(response.data.balanceSat).toFixed(),
        unconfirmed: new BigNumber(
          response.data.unconfirmedBalanceSat,
        ).toFixed(),
        address: response.data.addrStr,
        totalTransactions: response.data.txApperances,
      };
      console.log(bal);
      return bal;
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
