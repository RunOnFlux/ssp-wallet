import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { cryptos, currency, transaction, wallets, wallet } from './types';

interface FluxState {
  xpubWallet: string;
  xpubKey: string;
  wallets: wallets;
  sspWalletKeyIdentity: string;
  sspWalletIdentity: string;
  blockheight: number;
  walletInUse: string;
}

const initialState: FluxState = {
  xpubWallet: '',
  xpubKey: '',
  wallets: {},
  sspWalletKeyIdentity: '',
  sspWalletIdentity: '',
  blockheight: 0,
  walletInUse: '0-0',
};

const initialWalletState: wallet = {
  address: '',
  redeemScript: '',
  balance: '0.00',
  unconfirmedBalance: '0.00',
  transactions: [],
};

const initialStatePasswordBlob = {
  passwordBlob: '',
};

interface RatesState {
  cryptoRates: cryptos;
  fiatRates: currency;
}

const initialRatesState: RatesState = {
  cryptoRates: {
    flux: 0,
  },
  fiatRates: {
    EUR: 0,
    AUD: 0,
    TRY: 0,
    TWD: 0,
    RUB: 0,
    MMK: 0,
    MXN: 0,
    MYR: 0,
    CNY: 0,
    PKR: 0,
    PLN: 0,
    THB: 0,
    PHP: 0,
    ARS: 0,
    SAR: 0,
    DKK: 0,
    SGD: 0,
    AED: 0,
    USD: 0,
    CLP: 0,
    ILS: 0,
    NZD: 0,
    HKD: 0,
    XDR: 0,
    KWD: 0,
    BDT: 0,
    GBP: 0,
    SEK: 0,
    IDR: 0,
    CHF: 0,
    JPY: 0,
    XAU: 0,
    BMD: 0,
    ZAR: 0,
    HUF: 0,
    BRL: 0,
    KRW: 0,
    LKR: 0,
    NOK: 0,
    INR: 0,
    VEF: 0,
    CAD: 0,
    VND: 0,
    XAG: 0,
    CZK: 0,
    BHD: 0,
    UAH: 0,
  },
};

const passwordBlobSlice = createSlice({
  name: 'passwordBlob',
  initialState: initialStatePasswordBlob,
  reducers: {
    setPasswordBlob: (state, action: PayloadAction<string>) => {
      state.passwordBlob = action.payload;
    },
    setPasswordBlobInitialState: (state) => {
      state.passwordBlob = '';
    },
  },
});

const fluxSlice = createSlice({
  name: 'flux',
  initialState,
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
    setTransactions: (
      state,
      action: PayloadAction<{ wallet: string; data: transaction[] }>,
    ) => {
      state.wallets[action.payload.wallet] = state.wallets[
        action.payload.wallet
      ] || { ...initialWalletState };
      state.wallets[action.payload.wallet].transactions = action.payload.data;
    },
    setSspWalletKeyIdentity: (state, action: PayloadAction<string>) => {
      state.sspWalletKeyIdentity = action.payload;
    },
    setSspWalletIdentity: (state, action: PayloadAction<string>) => {
      state.sspWalletIdentity = action.payload;
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
    setFluxInitialState: (state) => {
      state.sspWalletKeyIdentity = '';
      state.sspWalletIdentity = '';
      state.xpubWallet = '';
      state.xpubKey = '';
      state.wallets = {};
      state.blockheight = 0;
      state.walletInUse = '0-0';
    },
  },
});

const fiatCryptoRatesSlice = createSlice({
  name: 'fiatCryptoRates',
  initialState: initialRatesState,
  reducers: {
    setCryptoRates: (state, action: PayloadAction<cryptos>) => {
      state.cryptoRates = action.payload;
    },
    setFiatRates: (state, action: PayloadAction<currency>) => {
      state.fiatRates = action.payload;
    },
  },
});

export const {
  setAddress,
  setRedeemScript,
  setXpubWallet,
  setXpubKey,
  setFluxInitialState,
  setBalance,
  setUnconfirmedBalance,
  setTransactions,
  setSspWalletKeyIdentity,
  setSspWalletIdentity,
  setBlockheight,
  setWalletInUse,
} = fluxSlice.actions;

export const { setPasswordBlob, setPasswordBlobInitialState } =
  passwordBlobSlice.actions;

export const { setCryptoRates, setFiatRates } = fiatCryptoRatesSlice.actions;

export const store = configureStore({
  reducer: {
    flux: fluxSlice.reducer,
    passwordBlob: passwordBlobSlice.reducer,
    fiatCryptoRates: fiatCryptoRatesSlice.reducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
