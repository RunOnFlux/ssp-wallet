import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { transaction } from './types';
import { backends } from '@storage/backends';

interface FluxState {
  xpubWallet: string;
  xpubKey: string;
  address: string;
  redeemScript: string;
  balance: string;
  unconfirmedBalance: string;
  transactions: transaction[];
  sspWalletKeyIdentity: string;
  sspWalletIdentity: string;
  blockheight: number;
}

const initialState: FluxState = {
  xpubWallet: '',
  xpubKey: '',
  address: '',
  redeemScript: '',
  balance: '0.00',
  unconfirmedBalance: '0.00',
  transactions: [],
  sspWalletKeyIdentity: '',
  sspWalletIdentity: '',
  blockheight: 0,
};

const initialStatePasswordBlob = {
  passwordBlob: '',
};

const initialBackendState = {
  ssp: 'relay.ssp.runonflux.io',
  backends: backends,
};

interface backendObject {
  chain: string;
  node: string;
}

export const backendSlice = createSlice({
  name: 'backends',
  initialState: initialBackendState,
  reducers: {
    setSSPBackend: (state, action: PayloadAction<string>) => {
      state.ssp = action.payload;
    },
    setAssetBackend: (state, action: PayloadAction<backendObject>) => {
      const { chain, node } = action.payload;
      // todo: fix this
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      state.backends[chain].node = node;
    },
  },
});

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
    setAddress: (state, action: PayloadAction<string>) => {
      state.address = action.payload;
    },
    setRedeemScript: (state, action: PayloadAction<string>) => {
      state.redeemScript = action.payload;
    },
    setXpubWallet: (state, action: PayloadAction<string>) => {
      state.xpubWallet = action.payload;
    },
    setXpubKey: (state, action: PayloadAction<string>) => {
      state.xpubKey = action.payload;
    },
    setBalance: (state, action: PayloadAction<string>) => {
      state.balance = action.payload;
    },
    setUnconfirmedBalance: (state, action: PayloadAction<string>) => {
      state.unconfirmedBalance = action.payload;
    },
    setTransactions: (state, action: PayloadAction<transaction[]>) => {
      state.transactions = action.payload;
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
    setFluxInitialState: (state) => {
      state.sspWalletKeyIdentity = '';
      state.sspWalletIdentity = '';
      state.xpubWallet = '';
      state.xpubKey = '';
      state.address = '';
      state.redeemScript = '';
      state.balance = '0.00';
      state.unconfirmedBalance = '0.00';
      state.transactions = [];
      state.blockheight = 0;
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
} = fluxSlice.actions;

export const { setPasswordBlob, setPasswordBlobInitialState } =
  passwordBlobSlice.actions;

export const { setSSPBackend, setAssetBackend } = backendSlice.actions;

export const store = configureStore({
  reducer: {
    flux: fluxSlice.reducer,
    passwordBlob: passwordBlobSlice.reducer,
    backends: backendSlice.reducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
