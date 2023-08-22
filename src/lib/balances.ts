import axios from 'axios';
import BigNumber from 'bignumber.js';
import { balanceInsight, balance } from '../types';

import { backends } from '@storage/backends';

export async function fetchAddressBalance(
  address: string,
  chain: string,
): Promise<balance> {
  try {
    const bcks = backends();
    console.log(bcks);
    const backendConfig = bcks[chain];
    const url = `https://${backendConfig.node}/api/addr/${address}?noTxList=1`;
    const response = await axios.get<balanceInsight>(url);
    const bal: balance = {
      confirmed: new BigNumber(response.data.balanceSat).toFixed(),
      unconfirmed: new BigNumber(response.data.unconfirmedBalanceSat).toFixed(),
      address: response.data.addrStr,
      totalTransactions: response.data.txApperances,
    };
    console.log(bal);
    return bal;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
