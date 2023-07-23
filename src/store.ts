import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

const initialState = {
  xpubWallet: '',
  xpubKey: '',
  address: '',
  redeemScript: '',
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
    setFluxInitialState: (state) => {
      state.xpubWallet = '';
      state.xpubKey = '';
      state.address = '';
      state.redeemScript = '';
    },
  },
});

export const {
  setAddress,
  setRedeemScript,
  setXpubWallet,
  setXpubKey,
  setFluxInitialState,
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
