import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface XpubState {
  xpubWallet: string;
  xpubKey: string;
  passwordBlob: string;
}

const initialState: XpubState = {
  xpubWallet: '',
  xpubKey: '',
  passwordBlob: '',
};
const xpubSlice = createSlice({
  name: 'xpubFlux',
  initialState,
  reducers: {
    setPasswordBlob: (state, action: PayloadAction<string>) => {
      state.passwordBlob = action.payload;
    },
    setXpubWallet: (state, action: PayloadAction<string>) => {
      state.xpubWallet = action.payload;
    },
    setXpubKey: (state, action: PayloadAction<string>) => {
      state.xpubKey = action.payload;
    },
    setXpubInitialState: (state) => {
      state.xpubWallet = '';
      state.xpubKey = '';
      state.passwordBlob = '';
    },
  },
});

export const {
  setPasswordBlob,
  setXpubWallet,
  setXpubKey,
  setXpubInitialState,
} = xpubSlice.actions;

export const store = configureStore({
  reducer: {
    xpubs: xpubSlice.reducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
