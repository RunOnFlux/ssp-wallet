import axios from 'axios';
import {
  abeAsset,
  abeAssetResponse,
  zelcoreAsset,
  zelcoreAssetResponse,
} from '../types';

export async function fetchSellAssets(): Promise<abeAsset[]> {
  try {
    const url = 'https://abe.zelcore.io/v1/exchange/sellassets';
    const response = await axios.get<abeAssetResponse>(url);
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
    const response = await axios.get<abeAssetResponse>(url);
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
    const response = await axios.get<zelcoreAssetResponse>(url);
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
