import axios from 'axios';
import { networkFeesSSPRelay } from '../types';
import { sspConfig } from '@storage/ssp';

export async function fetchNetworkFees(): Promise<networkFeesSSPRelay> {
  try {
    const url = `https://${sspConfig().relay}/v1/networkfees`;
    const response = await axios.get<networkFeesSSPRelay>(url);
    if (response.data && response.data.length > 0) {
      return response.data;
    } else {
      throw new Error('Invalid response from SSP for network fees');
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
