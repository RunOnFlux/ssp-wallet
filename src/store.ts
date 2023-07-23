import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { transaction } from './types';

interface FluxState {
  xpubWallet: string;
  xpubKey: string;
  address: string;
  redeemScript: string;
  balance: string;
  unconfirmedBalance: string;
  transactions: transaction[];
}

const initialState: FluxState = {
  xpubWallet: '',
  xpubKey: '',
  address: '',
  redeemScript: '',
  balance: '0.00',
  unconfirmedBalance: '0.00',
  transactions: [],
};

const initialStatePasswordBlob = {
  passwordBlob: '',
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
    setFluxInitialState: (state) => {
      state.xpubWallet = '';
      state.xpubKey = '';
      state.address = '';
      state.redeemScript = '';
      state.balance = '0.00';
      state.unconfirmedBalance = '0.00';
      state.transactions = [];
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
} = fluxSlice.actions;

export const { setPasswordBlob, setPasswordBlobInitialState } =
  passwordBlobSlice.actions;

export const store = configureStore({
  reducer: {
    flux: fluxSlice.reducer,
    passwordBlob: passwordBlobSlice.reducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
