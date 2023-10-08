import {
  configureStore,
  createSlice,
  PayloadAction,
  combineReducers,
} from '@reduxjs/toolkit';
import { cryptos, currency, transaction } from '../types';

// ********** Import chains **********
import flux from './flux';
import fluxTestnet from './fluxTestnet';

const chains = {
  flux,
  fluxTestnet,
};
// ********** Import chains **********

const initialStatePasswordBlob = {
  passwordBlob: '',
};

interface sspState {
  sspWalletKeyIdentity: string;
  sspWalletIdentity: string;
  identityChain: 'flux';
  activeChain: keyof cryptos;
}

const initialSspState: sspState = {
  sspWalletKeyIdentity: '',
  sspWalletIdentity: '',
  identityChain: 'flux',
  activeChain: 'flux',
};

interface RatesState {
  cryptoRates: cryptos;
  fiatRates: currency;
}

const initialRatesState: RatesState = {
  cryptoRates: {
    flux: 0,
    fluxTestnet: 0,
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

const sspStateSlice = createSlice({
  name: 'sspState',
  initialState: initialSspState,
  reducers: {
    setSspWalletKeyIdentity: (state, action: PayloadAction<string>) => {
      state.sspWalletKeyIdentity = action.payload;
    },
    setSspWalletIdentity: (state, action: PayloadAction<string>) => {
      state.sspWalletIdentity = action.payload;
    },
    setActiveChain: (state, action: PayloadAction<keyof cryptos>) => {
      state.activeChain = action.payload;
    },
    setSSPInitialState: (state) => {
      state.sspWalletKeyIdentity = '';
      state.sspWalletIdentity = '';
      state.activeChain = 'flux';
    },
  },
});

export const { setPasswordBlob, setPasswordBlobInitialState } =
  passwordBlobSlice.actions;

export const { setCryptoRates, setFiatRates } = fiatCryptoRatesSlice.actions;

export const {
  setSSPInitialState,
  setSspWalletKeyIdentity,
  setSspWalletIdentity,
  setActiveChain,
} = sspStateSlice.actions;

const reducers = combineReducers({
  passwordBlob: passwordBlobSlice.reducer,
  fiatCryptoRates: fiatCryptoRatesSlice.reducer,
  sspState: sspStateSlice.reducer,
  flux: flux.reducer,
  fluxTestnet: fluxTestnet.reducer,
});

export const store = configureStore({
  reducer: reducers,
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;

// Chain control functions
export function setAddress(chain: keyof cryptos, wallet: string, data: string) {
  store.dispatch(chains[chain].actions.setAddress({ wallet, data }));
}
export function setRedeemScript(
  chain: keyof cryptos,
  wallet: string,
  data: string,
) {
  store.dispatch(chains[chain].actions.setRedeemScript({ wallet, data }));
}
export function setXpubWallet(chain: keyof cryptos, data: string) {
  store.dispatch(chains[chain].actions.setXpubWallet(data));
}
export function setXpubKey(chain: keyof cryptos, data: string) {
  store.dispatch(chains[chain].actions.setXpubKey(data));
}
export function setXpubWalletIdentity(data: string) {
  store.dispatch(chains.flux.actions.setXpubWallet(data));
}
export function setXpubKeyIdentity(data: string) {
  store.dispatch(chains.flux.actions.setXpubKey(data));
}
export function setBalance(chain: keyof cryptos, wallet: string, data: string) {
  store.dispatch(chains[chain].actions.setBalance({ wallet, data }));
}
export function setUnconfirmedBalance(
  chain: keyof cryptos,
  wallet: string,
  data: string,
) {
  store.dispatch(chains[chain].actions.setUnconfirmedBalance({ wallet, data }));
}
export function setTransactions(
  chain: keyof cryptos,
  wallet: string,
  data: transaction[],
) {
  store.dispatch(chains[chain].actions.setTransactions({ wallet, data }));
}
export function setBlockheight(chain: keyof cryptos, data: number) {
  store.dispatch(chains[chain].actions.setBlockheight(data));
}
export function setWalletInUse(chain: keyof cryptos, data: string) {
  store.dispatch(chains[chain].actions.setWalletInUse(data));
}
export function setChainInitialState(chain: keyof cryptos) {
  store.dispatch(chains[chain].actions.setChainInitialState());
}
export function setInitialStateForAllChains() {
  Object.keys(chains).forEach((chain: string) => {
    store.dispatch(chains[chain as keyof cryptos].actions.setChainInitialState());
  });
}
