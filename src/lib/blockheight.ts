import axios from 'axios';
import { getInfoInsight, cryptos, getInfoBlockbook } from '../types';

import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';

export async function getBlockheight(chain: keyof cryptos): Promise<number> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].backend === 'blockbook') {
      const url = `https://${backendConfig.node}/api/v2/status`;
      const response = await axios.get<getInfoBlockbook>(url);

      const currentBlockheight = response.data.blockbook.bestHeight;
      return currentBlockheight;
    } else {
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
