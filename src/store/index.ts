import {
  configureStore,
  createSlice,
  PayloadAction,
  combineReducers,
  Reducer,
} from '@reduxjs/toolkit';
import {
  cryptos,
  currency,
  transaction,
  node,
  networkFee,
  tokenBalanceEVM,
  chainState,
  servicesSSPRelay,
  exchangeProvider,
} from '../types';

import { blockchains, Token } from '@storage/blockchains';

// ********** Import chains **********
import chainSliceBase from './chainSliceBase';
import chainSliceBaseNodes from './chainSliceBaseNodes';
import chainSliceBaseTokens from './chainSliceBaseTokens';

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
  sepolia: chainSliceBaseTokens('sepolia'),
  eth: chainSliceBaseTokens('eth'),
  amoy: chainSliceBaseTokens('amoy'),
  polygon: chainSliceBaseTokens('polygon'),
  base: chainSliceBaseTokens('base'),
  bsc: chainSliceBaseTokens('bsc'),
  avax: chainSliceBaseTokens('avax'),
};
// ********** Import chains **********

const chainKeys = Object.keys(chains) as (keyof cryptos)[];

const initialStatePasswordBlob = {
  passwordBlob: '',
};

// internal is used for ssp communication only
// external is used for logging into services, public. Such as nodes, exchanges, etc. Just wallet identity (similar to FluxID)
interface sspState {
  sspWalletKeyInternalIdentity: string;
  sspWalletInternalIdentity: string;
  sspWalletExternalIdentity: string;
  identityChain: keyof cryptos;
  activeChain: keyof cryptos;
}

const initialSspState: sspState = {
  sspWalletKeyInternalIdentity: '',
  sspWalletInternalIdentity: '',
  sspWalletExternalIdentity: '',
  identityChain: 'btc',
  activeChain: 'btc',
};

interface nFState {
  base: number;
  priority?: number; // EVM must have it
}

interface networkFeeState {
  networkFees: Record<keyof cryptos, nFState>;
}

interface servicesAvailabilityState {
  servicesAvailability: servicesSSPRelay;
}

// make network fees based on chains object
// create {btc: 0, rvn: 0, ...} object
const initialNetworkFees: Record<keyof cryptos, nFState> = chainKeys.reduce(
  (acc, key) => {
    acc[key] = {
      base: blockchains[key].feePerByte ?? blockchains[key].baseFee, // feePerByte is for BTC, baseFee is for EVM (gwei)
      priority: blockchains[key].priorityFee, // for EVM only (gwei)
    };
    return acc;
  },
  {} as Record<keyof cryptos, nFState>,
);

const initialNetworkFeeState: networkFeeState = {
  networkFees: initialNetworkFees,
};

const initialServicesAvailabilityState: servicesAvailabilityState = {
  servicesAvailability: {
    onramp: false,
    offramp: false,
    swap: false,
  },
};

interface abeState {
  sellAssets: { [key: string]: string[] };
  buyAssets: { [key: string]: string[] };
  exchangeProviders: exchangeProvider[];
  abeMapping: { [key: string]: string };
}

interface tutorialState {
  isActive: boolean;
  tutorialType: string;
  currentStep: number;
  completedTutorials: string[];
}

const initialAbeState: abeState = {
  sellAssets: {},
  buyAssets: {},
  abeMapping: {},
  exchangeProviders: [],
};

const initialTutorialState: tutorialState = {
  isActive: false,
  tutorialType: '',
  currentStep: 0,
  completedTutorials: [],
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

// create {btc: [], rvn: [], ...} object
const initialContacts: Record<keyof cryptos, contact[]> = chainKeys.reduce(
  (acc, key) => {
    acc[key] = [];
    return acc;
  },
  {} as Record<keyof cryptos, contact[]>,
);
// create {btc: 0, rvn: 0, ...} object
const initialCryptoRates: cryptos = chainKeys.reduce((acc, key) => {
  acc[key] = 0;
  return acc;
}, {} as cryptos);

const initialRatesState: RatesState = {
  cryptoRates: initialCryptoRates,
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
  contacts: initialContacts,
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
      const definedCryptos = Object.keys(action.payload) as (keyof cryptos)[];
      definedCryptos.forEach((cc) => {
        state.contacts[cc] = action.payload[cc];
      });
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
        if (!state.networkFees[element.coin as keyof cryptos]) {
          return;
        }
        if (element.base || element.base === 0) {
          console.log(state.networkFees[element.coin as keyof cryptos]);
          state.networkFees[element.coin as keyof cryptos].base = element.base;
          state.networkFees[element.coin as keyof cryptos].priority =
            element.recommended;
        } else {
          state.networkFees[element.coin as keyof cryptos].base =
            element.recommended;
        }
      });
    },
  },
});

const servicesAvailabilitySlice = createSlice({
  name: 'servicesAvailability',
  initialState: initialServicesAvailabilityState,
  reducers: {
    setServicesAvailability: (
      state,
      action: PayloadAction<servicesSSPRelay>,
    ) => {
      state.servicesAvailability = action.payload;
    },
  },
});

const abeSlice = createSlice({
  name: 'abe',
  initialState: initialAbeState,
  reducers: {
    setSellAssets: (
      state,
      action: PayloadAction<{ [key: string]: string[] }>,
    ) => {
      state.sellAssets = action.payload;
    },
    setBuyAssets: (
      state,
      action: PayloadAction<{ [key: string]: string[] }>,
    ) => {
      state.buyAssets = action.payload;
    },
    setExchangeProviders: (
      state,
      action: PayloadAction<exchangeProvider[]>,
    ) => {
      state.exchangeProviders = action.payload;
    },
    setAbeMapping: (
      state,
      action: PayloadAction<{ [key: string]: string }>,
    ) => {
      state.abeMapping = action.payload;
    },
  },
});

const tutorialSlice = createSlice({
  name: 'tutorial',
  initialState: initialTutorialState,
  reducers: {
    setTutorialState: (
      state,
      action: PayloadAction<{
        isActive: boolean;
        tutorialType: string;
        currentStep: number;
      }>,
    ) => {
      state.isActive = action.payload.isActive;
      state.tutorialType = action.payload.tutorialType;
      state.currentStep = action.payload.currentStep;
    },
    setTutorialStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },
    setTutorialCompleted: (state, action: PayloadAction<string>) => {
      if (!state.completedTutorials.includes(action.payload)) {
        state.completedTutorials.push(action.payload);
      }
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

export const { setServicesAvailability } = servicesAvailabilitySlice.actions;

export const { setContacts, setInitialContactsState } = contactsSlice.actions;

export const {
  setSellAssets,
  setBuyAssets,
  setAbeMapping,
  setExchangeProviders,
} = abeSlice.actions;

export const {
  setTutorialState,
  setTutorialStep,
  setTutorialCompleted,
} = tutorialSlice.actions;

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
  servicesAvailability: servicesAvailabilitySlice.reducer,
  abe: abeSlice.reducer,
  tutorial: tutorialSlice.reducer,
  // === IMPORT CHAINS ===
  ...chainKeys.reduce(
    (acc, key) => {
      acc[key] = chains[key].reducer;
      return acc;
    },
    {} as Record<keyof cryptos, Reducer<chainState>>,
  ),
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
export function setTokenBalances(
  chain: keyof cryptos,
  wallet: string,
  data: tokenBalanceEVM[],
) {
  if (
    chain === 'sepolia' ||
    chain === 'eth' ||
    chain === 'amoy' ||
    chain === 'polygon' ||
    chain === 'base' ||
    chain === 'bsc' ||
    chain === 'avax'
  ) {
    // todo needs to be adjusted on chain add
    store.dispatch(chains[chain].actions.setTokenBalances({ wallet, data }));
  }
}
export function setActivatedTokens(
  chain: keyof cryptos,
  wallet: string,
  data: string[],
) {
  if (
    chain === 'sepolia' ||
    chain === 'eth' ||
    chain === 'amoy' ||
    chain === 'polygon' ||
    chain === 'base' ||
    chain === 'bsc' ||
    chain === 'avax'
  ) {
    // todo needs to be adjusted on chain add
    store.dispatch(chains[chain].actions.setActivatedTokens({ wallet, data }));
  }
}
export function setImportedTokens(chain: keyof cryptos, data: Token[]) {
  if (
    chain === 'sepolia' ||
    chain === 'eth' ||
    chain === 'amoy' ||
    chain === 'polygon' ||
    chain === 'base' ||
    chain === 'bsc' ||
    chain === 'avax'
  ) {
    // todo needs to be adjusted on chain add
    store.dispatch(chains[chain].actions.setImportedTokens(data));
  }
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
    // todo needs to be adjusted on chain add
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
