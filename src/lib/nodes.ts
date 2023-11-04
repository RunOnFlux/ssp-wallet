import axios from 'axios';
import {
  utxo,
  confirmedNodeInsight,
  confirmedNodesInsight,
  dosFlux,
  dosNodeFlux,
  startFlux,
  startNodeFlux
} from '../types';

import { backends } from '@storage/backends';

export async function fetchNodesUtxos(
  address: string,
  chain: string,
): Promise<utxo[]> {
  try {
    const backendConfig = backends()[chain];
    const url = `https://${backendConfig.node}/api/fluxnode/addrs/${address}/utxo`;
    const { data } = await axios.get<utxo[]>(url);
    const fetchedUtxos = data;
    const utxos = fetchedUtxos.map((x) => ({
      txid: x.txid,
      vout: x.vout,
      scriptPubKey: x.scriptPubKey,
      satoshis: x.satoshis.toString(),
    }));
    return utxos;
  } catch (e) {
    console.log(e);
    return [];
  }
}

export async function getNodesOnNetwork(
  address: string,
  chain: string,
): Promise<confirmedNodeInsight[]> {
  try {
    const backendConfig = backends()[chain];
    const filter = address;
    const url = `https://${backendConfig.node}/api/fluxnode/listfluxnodes/`;
    const { data } = await axios.post<confirmedNodesInsight>(url, { filter });
    const fluxNodesConfirmed = data.result;
    return fluxNodesConfirmed;
  } catch (e) {
    console.log(e);
    return [];
  }
}

export async function fetchDOSFlux(): Promise<dosNodeFlux[]> {
  try {
    const url = 'https://api.runonflux.io/daemon/getdoslist';
    const { data } = await axios.get<dosFlux>(url);
    const fluxNodesDos = data.data;
    return fluxNodesDos;
  } catch (e) {
    console.log(e);
    return [];
  }
}

export async function fetchStartFlux(): Promise<startNodeFlux[]> {
  try {
    const url = 'https://api.runonflux.io/daemon/getstartlist';
    const { data } = await axios.get<startFlux>(url);
    const fluxNodesStart = data.data;
    return fluxNodesStart;
  } catch (e) {
    console.log(e);
    return [];
  }
}

