import axios from 'axios';
import {
  utxo,
  confirmedNodeInsight,
  confirmedNodesInsight,
  dosFlux,
  dosFluxInsight,
  dosNodeFlux,
  startFlux,
  startFluxInsight,
  startNodeFlux,
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
    const url = `https://${backendConfig.node}/api/fluxnode/listfluxnodes`;
    const { data } = await axios.post<confirmedNodesInsight>(url, { filter });
    const fluxNodesConfirmed = data.result;
    return fluxNodesConfirmed;
  } catch (e) {
    console.log(e);
    return [];
  }
}

export async function fetchDOSFlux(chain: string): Promise<dosNodeFlux[]> {
  try {
    if (chain === 'flux') {
      const url = 'https://api.runonflux.io/daemon/getdoslist';
      const { data } = await axios.get<dosFlux>(url);
      const fluxNodesDos = data.data;
      return fluxNodesDos;
    } // use insight
    const backendConfig = backends()[chain];
    const url = `https://${backendConfig.node}/api/fluxnode/doslist`;
    const { data } = await axios.get<dosFluxInsight>(url);
    const fluxNodesDos = data.result;
    return fluxNodesDos;
  } catch (e) {
    console.log(e);
    return [];
  }
}

export async function fetchStartFlux(chain: string): Promise<startNodeFlux[]> {
  try {
    if (chain === 'flux') {
      const url = 'https://api.runonflux.io/daemon/getstartlist';
      const { data } = await axios.get<startFlux>(url);
      const fluxNodesStart = data.data;
      return fluxNodesStart;
    } // use insight
    const backendConfig = backends()[chain];
    const url = `https://${backendConfig.node}/api/fluxnode/startlist`;
    const { data } = await axios.get<startFluxInsight>(url);
    const fluxNodesStart = data.result;
    return fluxNodesStart;
  } catch (e) {
    console.log(e);
    return [];
  }
}
