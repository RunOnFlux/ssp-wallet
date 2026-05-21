import axios from 'axios';
import BigNumber from 'bignumber.js';
import {
  balanceInsight,
  balanceBlockbook,
  balance,
  evm_call,
  alchemyCallTokenBalances,
  tokenBalance,
  tokenBalanceEVM,
} from '../types';

import { backends } from '@storage/backends';
import { blockchains } from '@storage/blockchains';

export async function fetchAddressBalance(
  address: string,
  chain: string,
): Promise<balance> {
  try {
    const backendConfig = backends()[chain];
    if (blockchains[chain].chainType === 'evm') {
      const url = `https://${backendConfig.node}`;
      const data = {
        id: Date.now(),
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
      };
      const response = await axios.post<evm_call>(url, data);
      const bal: balance = {
        confirmed: new BigNumber(response.data.result || '0').toFixed(),
        unconfirmed: '0',
        address: address,
      };
      return bal;
    } else if (blockchains[chain].chainType === 'sol') {
      // Solana: use JSON-RPC getBalance against the configured node.
      // Returns lamports (1 SOL = 10^9 lamports).
      const url = `https://${backendConfig.node}`;
      const data = {
        id: Date.now(),
        jsonrpc: '2.0',
        method: 'getBalance',
        params: [address],
      };
      const response = await axios.post<{
        result: { value: number };
      }>(url, data);
      const bal: balance = {
        confirmed: new BigNumber(response.data.result?.value ?? 0).toFixed(),
        unconfirmed: '0',
        address: address,
      };
      return bal;
    } else if (blockchains[chain].backend === 'blockbook') {
      const url = `https://${backendConfig.node}/api/v2/address/${address}?details=basic`;
      const response = await axios.get<balanceBlockbook>(url);
      const bal: balance = {
        confirmed: response.data.balance || '0',
        unconfirmed: response.data.unconfirmedBalance || '0',
        address: response.data.address,
        totalTransactions: response.data.txs,
      };
      return bal;
    } else {
      const url = `https://${backendConfig.node}/api/addr/${address}?noTxList=1`;
      const response = await axios.get<balanceInsight>(url);
      const bal: balance = {
        confirmed: new BigNumber(response.data.balanceSat || '0').toFixed(),
        unconfirmed: new BigNumber(
          response.data.unconfirmedBalanceSat || '0',
        ).toFixed(),
        address: response.data.addrStr,
        totalTransactions: response.data.txApperances,
      };
      return bal;
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}

async function fetchBalanceChunk(
  address: string,
  chain: string,
  tokens: string[],
): Promise<tokenBalance[]> {
  const backendConfig = backends()[chain];
  const url = `https://${backendConfig.node}`;

  // remove any token in tokens if token does not start with 0x prefix (only fetch proper contracts)
  const filteredTokens = tokens.filter((token) => token.startsWith('0x'));
  if (!filteredTokens.length) {
    return [];
  }
  // get activated tokens
  const data = {
    id: Date.now(),
    jsonrpc: '2.0',
    method: 'alchemy_getTokenBalances',
    params: [address, filteredTokens],
  };
  const response = await axios.post<alchemyCallTokenBalances>(url, data);
  return response.data.result.tokenBalances;
}
export async function fetchAddressTokenBalances(
  address: string,
  chain: string,
  tokens: string[],
): Promise<tokenBalanceEVM[]> {
  try {
    // Solana: fetch all parsed token accounts owned by the vault and
    // intersect with the requested mint list. One RPC call regardless of
    // token count, no Alchemy-style batching needed.
    if (blockchains[chain].chainType === 'sol') {
      const backendConfig = backends()[chain];
      const url = `https://${backendConfig.node}`;
      const data = {
        id: Date.now(),
        jsonrpc: '2.0',
        method: 'getTokenAccountsByOwner',
        params: [
          address,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' },
        ],
      };
      const response = await axios.post<{
        result: {
          value: Array<{
            account: {
              data: {
                parsed: {
                  info: {
                    mint: string;
                    tokenAmount: { amount: string };
                  };
                };
              };
            };
          }>;
        };
      }>(url, data);
      const accounts = response.data.result?.value ?? [];
      const requested = new Set(tokens.filter((t) => t.length > 0));
      const out: tokenBalanceEVM[] = [];
      for (const acc of accounts) {
        const info = acc.account.data.parsed.info;
        if (requested.has(info.mint)) {
          out.push({
            contract: info.mint,
            balance: new BigNumber(info.tokenAmount.amount || '0').toFixed(),
          });
        }
      }
      return out;
    }
    if (blockchains[chain].chainType !== 'evm') {
      throw new Error('Only EVM and Solana chains support token balances');
    }
    const tokenChunks = [];
    // split tokens into chunks of 100
    for (let i = 0; i < tokens.length; i += 100) {
      tokenChunks.push(tokens.slice(i, i + 100));
    }

    const promises: unknown[] = [];
    tokenChunks.forEach((chunk) => {
      promises.push(fetchBalanceChunk(address, chain, chunk));
    });
    // for each token chunk fetch the token balance, use promise all to fetch all chunks, then put the balances response together
    const balances: tokenBalance[][] = (await Promise.all(
      promises,
    )) as tokenBalance[][];
    // put the balances array together to one array
    const allBalances: tokenBalance[] = [];
    balances.forEach((bal) => {
      allBalances.push(...bal);
    });

    const balancesEVM: tokenBalanceEVM[] = [];
    allBalances.forEach((bal) => {
      balancesEVM.push({
        contract: bal.contractAddress,
        balance: new BigNumber(bal.tokenBalance || '0').toFixed(),
      });
    });

    return balancesEVM;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
