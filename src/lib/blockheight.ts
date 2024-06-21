import axios from 'axios';
import { getInfoInsight, cryptos, getInfoBlockbook, eth_blockNumber } from '../types';

import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';

export async function getBlockheight(chain: keyof cryptos): Promise<number> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].backend === 'alchemy') {
      const url = `https://${backendConfig.node}`;
      const data = {
        'id': Date.now(),
        'jsonrpc': '2.0',
        'method': 'eth_blockNumber'
      }
      const response = await axios.post<eth_blockNumber>(url, data);
      const hexHeight = response.data.result;
      const currentBlockheight = parseInt(hexHeight, 16);
      return currentBlockheight;
    }
    if (blockchains[chain].backend === 'blockbook') {
      const url = `https://${backendConfig.node}/api/v2/status`;
      const response = await axios.get<getInfoBlockbook>(url);

      const currentBlockheight = response.data.blockbook.bestHeight;
      return currentBlockheight;
    }
    // defaul to insight
    const url = `https://${backendConfig.node}/api/status?getinfo`;
    const response = await axios.get<getInfoInsight>(url);

    const currentBlockheight = response.data.info.blocks;
    return currentBlockheight;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
