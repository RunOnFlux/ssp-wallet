import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { transaction, chainState, wallet, tokenBalanceEVM } from '../../types';
import { Token } from '@storage/blockchains';

const initialWalletState: wallet = {
  address: '',
  redeemScript: '',
  witnessScript: '',
  balance: '0.00',
  unconfirmedBalance: '0.00',
  tokenBalances: [],
  transactions: [],
  activatedTokens: [],
};

const initialState: chainState = {
  xpubWallet: '',
  xpubKey: '',
  wallets: {},
  blockheight: 0,
  walletInUse: '0-0',
  importedTokens: [],
};

function makeChainSlice(chainName: string) {
  const chainSlice = createSlice({
    name: chainName,
    initialState: initialState,
    reducers: {
      setAddress: (
        state,
        action: PayloadAction<{ wallet: string; data: string }>,
      ) => {
        state.wallets[action.payload.wallet] = state.wallets[
          action.payload.wallet
        ] || { ...initialWalletState };
        state.wallets[action.payload.wallet].address = action.payload.data;
      },
      setRedeemScript: (
        state,
        action: PayloadAction<{ wallet: string; data: string }>,
      ) => {
        state.wallets[action.payload.wallet] = state.wallets[
          action.payload.wallet
        ] || { ...initialWalletState };
        state.wallets[action.payload.wallet].redeemScript = action.payload.data;
      },
      setWitnessScript: (
        state,
        action: PayloadAction<{ wallet: string; data: string }>,
      ) => {
        state.wallets[action.payload.wallet] = state.wallets[
          action.payload.wallet
        ] || { ...initialWalletState };
        state.wallets[action.payload.wallet].witnessScript =
          action.payload.data;
      },
      setXpubWallet: (state, action: PayloadAction<string>) => {
        state.xpubWallet = action.payload;
      },
      setXpubKey: (state, action: PayloadAction<string>) => {
        state.xpubKey = action.payload;
      },
      setBalance: (
        state,
        action: PayloadAction<{ wallet: string; data: string }>,
      ) => {
        state.wallets[action.payload.wallet] = state.wallets[
          action.payload.wallet
        ] || { ...initialWalletState };
        state.wallets[action.payload.wallet].balance = action.payload.data;
      },
      setUnconfirmedBalance: (
        state,
        action: PayloadAction<{ wallet: string; data: string }>,
      ) => {
        state.wallets[action.payload.wallet] = state.wallets[
          action.payload.wallet
        ] || { ...initialWalletState };
        state.wallets[action.payload.wallet].unconfirmedBalance =
          action.payload.data;
      },
      setTokenBalances: (
        state,
        action: PayloadAction<{ wallet: string; data: tokenBalanceEVM[] }>,
      ) => {
        state.wallets[action.payload.wallet] = state.wallets[
          action.payload.wallet
        ] || { ...initialWalletState };
        state.wallets[action.payload.wallet].tokenBalances =
          action.payload.data;
      },
      setActivatedTokens: (
        state,
        action: PayloadAction<{ wallet: string; data: string[] }>,
      ) => {
        state.wallets[action.payload.wallet] = state.wallets[
          action.payload.wallet
        ] || { ...initialWalletState };
        state.wallets[action.payload.wallet].activatedTokens =
          action.payload.data;
      },
      setTransactions: (
        state,
        action: PayloadAction<{ wallet: string; data: transaction[] }>,
      ) => {
        state.wallets[action.payload.wallet] = state.wallets[
          action.payload.wallet
        ] || { ...initialWalletState };
        state.wallets[action.payload.wallet].transactions = action.payload.data;
      },
      setBlockheight: (state, action: PayloadAction<number>) => {
        state.blockheight = action.payload;
      },
      setWalletInUse: (state, action: PayloadAction<string>) => {
        state.wallets[action.payload] = state.wallets[action.payload] || {
          ...initialWalletState,
        };
        state.walletInUse = action.payload;
      },
      removeWallet: (state, action: PayloadAction<{ wallet: string }>) => {
        delete state.wallets[action.payload.wallet];
      },
      setImportedTokens: (state, action: PayloadAction<Token[]>) => {
        state.importedTokens = action.payload;
      },
      setChainInitialState: (state) => {
        state.xpubWallet = '';
        state.xpubKey = '';
        state.wallets = {};
        state.blockheight = 0;
        state.walletInUse = '0-0';
        state.importedTokens = [];
      },
    },
  });
  return chainSlice;
}

export default makeChainSlice;
