import axios from 'axios';
import { currencySSPRelay } from '../types';
import { sspConfig } from '@storage/ssp';

export interface currency {
  usd: number;
}
export async function fetchRate(chain: string): Promise<currency> {
  try {
    const url = `https://${sspConfig().relay}/v1/rates`;
    const response = await axios.get<currencySSPRelay>(url);
    const currencyObj: currency = response.data[chain];
    return currencyObj;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
