import axios from 'axios';
import { getInfoInsight, cryptos, getInfoBlockbook, evm_call } from '../types';

import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';
import { fetchKasTip } from './kaspa';

export async function getBlockheight(chain: keyof cryptos): Promise<number> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].chainType === 'kas') {
      // Kaspa has no block height: rows carry the accepting block's blue
      // score, so the tip is the virtual chain blue score.
      return await fetchKasTip(chain);
    }
    if (blockchains[chain].chainType === 'evm') {
      const url = `https://${backendConfig.node}`;
      const data = {
        id: Date.now(),
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
      };
      const response = await axios.post<evm_call>(url, data);
      const hexHeight = response.data.result;
      const currentBlockheight = parseInt(hexHeight, 16);
      return currentBlockheight;
    } else if (blockchains[chain].backend === 'blockbook') {
      const url = `https://${backendConfig.node}/api/v2/status`;
      const response = await axios.get<getInfoBlockbook>(url);

      const currentBlockheight = response.data.blockbook.bestHeight;
      return currentBlockheight;
    } else {
      // defaul to insight
      const url = `https://${backendConfig.node}/api/status?getinfo`;
      const response = await axios.get<getInfoInsight>(url);

      const currentBlockheight = response.data.info.blocks;
      return currentBlockheight;
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
