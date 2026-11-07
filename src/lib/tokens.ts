import axios from 'axios';
import { sspConfig } from '@storage/ssp';
import { blockchains } from '@storage/blockchains';
import { tokenDataSSPRelay } from 'src/types';
import { fetchTrc20Metadata } from './tron';

export async function getTokenMetadata(
  contractAddress: string,
  network: string,
): Promise<tokenDataSSPRelay> {
  // TRON: read name/symbol/decimals from the TRC-20 itself over the SSP TRON
  // node (triggerconstantcontract); the relay token-info route is EVM/SPL.
  if (blockchains[network]?.chainType === 'tron') {
    const meta = await fetchTrc20Metadata(contractAddress, network);
    return { ...meta, logo: null };
  }
  const url = `https://${sspConfig().relay}/v1/tokeninfo/${network}/${contractAddress}`;
  const response = await axios.get<tokenDataSSPRelay>(url);
  return response.data;
}
