import axios from 'axios';
import { getInfoInsight } from '../types';

import { blockchains } from '@storage/blockchains';

export async function getBlockheight(chain = 'flux'): Promise<number> {
  try {
    const blockchainConfig = blockchains[chain];
    const url = `https://${blockchainConfig.explorer}/api/status?getinfo`;
    const response = await axios.get<getInfoInsight>(url);

    const currentBlockheight = response.data.info.blocks;
    return currentBlockheight;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
