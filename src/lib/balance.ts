import axios from 'axios';
import BigNumber from 'bignumber.js';
import { balanceInsight, balance } from '../types';

import { blockchains } from '@storage/blockchains';

export async function fetchBalance(
  address: string,
  chain: string,
): Promise<balance> {
  try {
    const blockchainConfig = blockchains[chain];
    // https://explorer.runonflux.io/api/addr/t1QztLAkJHxH21xJ4qYX3sZ4k1ZkdijaHE7?noTxList=1
    const url = `https://${blockchainConfig.explorer}/api/addr/${address}?noTxList=1`;
    const response = await axios.get<balanceInsight>(url);
    const bal: balance = {
      confirmed: new BigNumber(response.data.balanceSat).toFixed(),
      unconfirmed: new BigNumber(response.data.unconfirmedBalanceSat).toFixed(),
      address: response.data.addrStr,
    };
    return bal;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
