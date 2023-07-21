import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface XpubState {
  xpubWallet: string;
  xpubKey: string;
}

const initialState: XpubState = { xpubWallet: '', xpubKey: '' };
const xpubSlice = createSlice({
  name: 'xpubFlux',
  initialState,
  reducers: {
    setXpubWallet: (state, action: PayloadAction<string>) => {
      state.xpubWallet = action.payload;
    },
    setXpubKey: (state, action: PayloadAction<string>) => {
      state.xpubKey = action.payload;
    },
    setXpubInitialState: (state) => {
      state.xpubWallet = '';
      state.xpubKey = '';
    },
  },
});

export const { setXpubWallet } = xpubSlice.actions;
export const { setXpubKey } = xpubSlice.actions;
export const { setXpubInitialState } = xpubSlice.actions;

export const store = configureStore({
  reducer: {
    xpubs: xpubSlice.reducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
