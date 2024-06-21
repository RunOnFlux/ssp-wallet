import {
  configureStore,
  createSlice,
  PayloadAction,
  combineReducers,
} from '@reduxjs/toolkit';
import { cryptos, currency, transaction, node, networkFee } from '../types';

import { blockchains } from '@storage/blockchains';

// ********** Import chains **********
import chainSliceBase from './chainSliceBase';
import chainSliceBaseNodes from './chainSliceBaseNodes';

const chains = {
  flux: chainSliceBaseNodes('flux'),
  fluxTestnet: chainSliceBaseNodes('fluxTestnet'),
  rvn: chainSliceBase('rvn'),
  ltc: chainSliceBase('ltc'),
  btc: chainSliceBase('btc'),
  doge: chainSliceBase('doge'),
  zec: chainSliceBase('zec'),
  bch: chainSliceBase('bch'),
  btcTestnet: chainSliceBase('btcTestnet'),
  btcSignet: chainSliceBase('btcSignet'),
  sepolia: chainSliceBase('sepolia'),
};
// ********** Import chains **********

const initialStatePasswordBlob = {
  passwordBlob: '',
};

// internal is used for ssp communication only
// external is used for logging into services, public. Such as nodes, exchanges, etc. Just wallet identity (similar to FluxID)
interface sspState {
  sspWalletKeyInternalIdentity: string;
  sspWalletInternalIdentity: string;
  sspWalletExternalIdentity: string;
  identityChain: 'btc';
  activeChain: keyof cryptos;
}

const initialSspState: sspState = {
  sspWalletKeyInternalIdentity: '',
  sspWalletInternalIdentity: '',
  sspWalletExternalIdentity: '',
  identityChain: 'btc',
  activeChain: 'btc',
};

const initialNetworkFeeState = {
  networkFees: {
    flux: blockchains.flux.feePerByte,
    fluxTestnet: blockchains.fluxTestnet.feePerByte,
    rvn: blockchains.rvn.feePerByte,
    ltc: blockchains.ltc.feePerByte,
    btc: blockchains.btc.feePerByte,
    doge: blockchains.doge.feePerByte,
    zec: blockchains.zec.feePerByte,
    bch: blockchains.bch.feePerByte,
    btcTestnet: blockchains.btcTestnet.feePerByte,
    btcSignet: blockchains.btcSignet.feePerByte,
    sepolia: 0, // TODO
  },
};

interface RatesState {
  cryptoRates: cryptos;
  fiatRates: currency;
}

interface contact {
  id: number;
  name: string;
  address: string;
}
interface ContactsState {
  contacts: Record<keyof cryptos, contact[]>;
}

const initialRatesState: RatesState = {
  cryptoRates: {
    flux: 0,
    fluxTestnet: 0,
    rvn: 0,
    ltc: 0,
    btc: 0,
    doge: 0,
    zec: 0,
    bch: 0,
    btcTestnet: 0,
    btcSignet: 0,
    sepolia: 0,
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
    BTC: 0,
    ETH: 0,
  },
};

const initialContactsState: ContactsState = {
  contacts: {
    flux: [],
    fluxTestnet: [],
    rvn: [],
    ltc: [],
    btc: [],
    doge: [],
    zec: [],
    bch: [],
    btcTestnet: [],
    btcSignet: [],
    sepolia: [],
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

const contactsSlice = createSlice({
  name: 'contacts',
  initialState: initialContactsState,
  reducers: {
    setContacts: (
      state,
      action: PayloadAction<Record<keyof cryptos, contact[]>>,
    ) => {
      state.contacts = action.payload;
    },
    setInitialContactsState: (state) => {
      state.contacts = initialContactsState.contacts;
    },
  },
});

const networkFeesSlice = createSlice({
  name: 'networkFees',
  initialState: initialNetworkFeeState,
  reducers: {
    setNetworkFees: (state, action: PayloadAction<networkFee[]>) => {
      action.payload.forEach((element) => {
        state.networkFees[element.coin as keyof cryptos] = element.recommended;
      });
    },
  },
});

const sspStateSlice = createSlice({
  name: 'sspState',
  initialState: initialSspState,
  reducers: {
    // internal for ssp communication
    setSspWalletKeyInternalIdentity: (state, action: PayloadAction<string>) => {
      state.sspWalletKeyInternalIdentity = action.payload;
    },
    setSspWalletInternalIdentity: (state, action: PayloadAction<string>) => {
      state.sspWalletInternalIdentity = action.payload;
    },
    // external for logging into services, sspId (similar to FluxID)
    setSspWalletExternalIdentity: (state, action: PayloadAction<string>) => {
      state.sspWalletExternalIdentity = action.payload;
    },
    setActiveChain: (state, action: PayloadAction<keyof cryptos>) => {
      state.activeChain = action.payload;
    },
    setSSPInitialState: (state) => {
      state.sspWalletKeyInternalIdentity = '';
      state.sspWalletInternalIdentity = '';
      state.sspWalletExternalIdentity = '';
      state.activeChain = 'btc';
    },
  },
});

export const { setPasswordBlob, setPasswordBlobInitialState } =
  passwordBlobSlice.actions;

export const { setCryptoRates, setFiatRates } = fiatCryptoRatesSlice.actions;

export const { setNetworkFees } = networkFeesSlice.actions;

export const { setContacts, setInitialContactsState } = contactsSlice.actions;

export const {
  setSSPInitialState,
  setSspWalletKeyInternalIdentity,
  setSspWalletInternalIdentity,
  setSspWalletExternalIdentity,
  setActiveChain,
} = sspStateSlice.actions;

const reducers = combineReducers({
  passwordBlob: passwordBlobSlice.reducer,
  fiatCryptoRates: fiatCryptoRatesSlice.reducer,
  networkFees: networkFeesSlice.reducer,
  sspState: sspStateSlice.reducer,
  contacts: contactsSlice.reducer,
  // === IMPORT CHAINS ===
  flux: chains.flux.reducer,
  fluxTestnet: chains.fluxTestnet.reducer,
  rvn: chains.rvn.reducer,
  ltc: chains.ltc.reducer,
  btc: chains.btc.reducer,
  doge: chains.doge.reducer,
  zec: chains.zec.reducer,
  bch: chains.bch.reducer,
  btcTestnet: chains.btcTestnet.reducer,
  btcSignet: chains.btcSignet.reducer,
  sepolia: chains.sepolia.reducer,
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
export function setWitnessScript(
  chain: keyof cryptos,
  wallet: string,
  data: string,
) {
  store.dispatch(chains[chain].actions.setWitnessScript({ wallet, data }));
}
export function setXpubWallet(chain: keyof cryptos, data: string) {
  store.dispatch(chains[chain].actions.setXpubWallet(data));
}
export function setXpubKey(chain: keyof cryptos, data: string) {
  store.dispatch(chains[chain].actions.setXpubKey(data));
}
export function setXpubWalletIdentity(data: string) {
  store.dispatch(
    chains[initialSspState.identityChain].actions.setXpubWallet(data),
  );
}
export function setXpubKeyIdentity(data: string) {
  store.dispatch(
    chains[initialSspState.identityChain].actions.setXpubKey(data),
  );
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
export function setNodes(chain: keyof cryptos, wallet: string, data: node[]) {
  if (chain === 'fluxTestnet' || chain === 'flux') {
    store.dispatch(chains[chain].actions.setNodes({ wallet, data }));
  }
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
export function removeWallet(chain: keyof cryptos, wallet: string) {
  store.dispatch(chains[chain].actions.removeWallet({ wallet }));
}
export function setInitialStateForAllChains() {
  Object.keys(chains).forEach((chain: string) => {
    store.dispatch(
      chains[chain as keyof cryptos].actions.setChainInitialState(),
    );
  });
}
