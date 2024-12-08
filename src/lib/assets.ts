import axios from 'axios';
import { sspConfig } from '@storage/ssp';
import { assetDataSSPRelay } from 'src/types';

export async function getFiatAssets(
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/assets/fiat`;
  const response = await axios.get<assetDataSSPRelay>(url);
  return response.data.data;
}

export async function getCryptoAssets(
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/assets/crypto`;
  const response = await axios.get<assetDataSSPRelay>(url);
  return response.data.data;
}

export async function getPurchaseDetailsByPurchaseId(
  purchaseId: string,
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/purchase/id/${purchaseId}`;
  const response = await axios.get<assetDataSSPRelay>(url);
  return response.data.data;
}

export async function sendPurchase(
  purchaseId: string,
  providerId: string,
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/purchase/send/${purchaseId}/${providerId}`;
  const response = await axios.get<assetDataSSPRelay>(url);
  return response.data.data;
}

export async function getAllPurchase(
  zelId: string,
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/purchase/history/${zelId}`;
  const response = await axios.get<assetDataSSPRelay>(url);
  return response.data.data;
}

export async function getAllPurchaseDetails(
  data: any,
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/purchase/details`;
  const response = await axios.post<assetDataSSPRelay>(url, data, {
    headers: { 
      'Content-Type' : 'application/json'
    }
  });
  return response.data.data;
}

export async function getPurchaseDetailsOnSelectedAsset(
  data: any,
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/purchase/details/assets`;
  const response = await axios.post<assetDataSSPRelay>(url, data, {
    headers: { 
      'Content-Type' : 'application/json'
    }
  });

  return response.data.data;
}

export async function createPurchaseDetails(
  data: any,
  zelId: string,
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/purchase/create/${zelId}`;
  const response = await axios.post<assetDataSSPRelay>(url, data, {
    headers: { 
      'Content-Type' : 'application/json'
    }
  });
  return response.data.data;
}

export async function getAllPurchaseStatus(
  data: any,
): Promise<assetDataSSPRelay> {
  const url = `https://${sspConfig().relay}/v1/assetinfo/purchase/status`;
  const response = await axios.post<assetDataSSPRelay>(url, data, {
    headers: { 
      'Content-Type' : 'application/json'
    }
  });
  return response.data.data;
}
