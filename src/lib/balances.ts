import axios from 'axios';
import BigNumber from 'bignumber.js';
import { balanceInsight, balanceBlockbook, balance, evm_call } from '../types';

import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';

export async function fetchAddressBalance(
  address: string,
  chain: string,
): Promise<balance> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].backend === 'alchemy') {
      const url = `https://${backendConfig.node}`;
      const data = {
        id: Date.now(),
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
      };
      const response = await axios.post<evm_call>(url, data);
      const bal: balance = {
        confirmed: new BigNumber(response.data.result).toFixed(),
        unconfirmed: '0',
        address: address,
      };
      return bal;
    } else if (blockchains[chain].backend === 'blockbook') {
      const url = `https://${backendConfig.node}/api/v2/address/${address}?details=basic`;
      const response = await axios.get<balanceBlockbook>(url);
      const bal: balance = {
        confirmed: response.data.balance,
        unconfirmed: response.data.unconfirmedBalance,
        address: response.data.address,
        totalTransactions: response.data.txs,
      };
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
      return bal;
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
