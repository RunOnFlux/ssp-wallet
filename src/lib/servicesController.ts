import axios from 'axios';
import { servicesSSPRelay } from '../types';
import { sspConfig } from '@storage/ssp';

// this controller is in place to prioritize sercurity of the platform, acts as a kill switch to disable eg. Purchase, Sell, Swap and other third party services in case of a security issues discovered on the third party service
export async function fetchServicesAvailability(): Promise<servicesSSPRelay> {
  try {
    const url = `https://${sspConfig().relay}/v1/services`;
    const response = await axios.get<servicesSSPRelay>(url);
    if (response.data) {
      return response.data;
    } else {
      throw new Error('Invalid response from SSP for available services');
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
