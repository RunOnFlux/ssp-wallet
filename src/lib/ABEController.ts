import axios from 'axios';
import { version } from '../../package.json';
import {
  abeAsset,
  abeAssetResponse,
  zelcoreAsset,
  zelcoreAssetResponse,
  pairDetailsResponse,
  createSwapResponse,
  createSwapData,
  swapHistoryResponse,
  exchangeProvider,
  exchangeProvidersResponse,
  swapHistoryOrder,
} from '../types';

const options = {
  headers: {
    ssp: version,
    zelid: '',
  },
};

export async function fetchSellAssets(): Promise<abeAsset[]> {
  try {
    const url = 'https://abe.zelcore.io/v1/exchange/sellassets';
    const response = await axios.get<abeAssetResponse>(url, options);
    if (response.data && response.data.data.length > 0) {
      return response.data.data;
    } else {
      throw new Error('Invalid response from ABE for sell assets');
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function fetchBuyAssets(): Promise<abeAsset[]> {
  try {
    const url = 'https://abe.zelcore.io/v1/exchange/buyassets';
    const response = await axios.get<abeAssetResponse>(url, options);
    if (response.data && response.data.data.length > 0) {
      return response.data.data;
    } else {
      throw new Error('Invalid response from ABE for buy assets');
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function fetchZelcoreAssets(): Promise<zelcoreAsset[]> {
  try {
    const url = 'https://abe.zelcore.io/v1/zelcoreassets';
    const response = await axios.get<zelcoreAssetResponse>(url, options);
    if (response.data && response.data.data.length > 0) {
      return response.data.data;
    } else {
      throw new Error('Invalid response from ABE for zelcore assets');
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function pairDetailsSellAmount(
  sellAsset: string,
  buyAsset: string,
  amount: number,
) {
  try {
    const data = {
      sellAsset,
      buyAsset,
      sellAmount: amount,
    };
    const url = `https://abe.zelcore.io/v1/exchange/pairdetailssellamount`;
    const response = await axios.post<pairDetailsResponse>(url, data, options);
    return response.data;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function createSwap(data: createSwapData, sspwkid: string) {
  try {
    const url = 'https://abe.zelcore.io/v1/exchange/createswap';
    options.headers['zelid'] = `ssp-${sspwkid}`;
    const response = await axios.post<createSwapResponse>(url, data, options);
    return response.data;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function getSwapHistory(
  sspwkid: string,
): Promise<swapHistoryOrder[]> {
  try {
    const url = `https://abe.zelcore.io/v1/exchange/user/history`;
    options.headers['zelid'] = `ssp-${sspwkid}`;
    const response = await axios.get<swapHistoryResponse>(url, options);
    if (response.data && typeof response.data.data === 'object') {
      return response.data.data;
    } else {
      throw new Error('Invalid response from ABE for swap history');
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function fetchABEexchangeProviders(): Promise<exchangeProvider[]> {
  try {
    const url = 'https://abe.zelcore.io/v1/exchanges';
    const response = await axios.get<exchangeProvidersResponse>(url, options);
    if (response.data && response.data.data.length > 0) {
      return response.data.data;
    } else {
      throw new Error('Invalid response from ABE for exchange providers');
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
