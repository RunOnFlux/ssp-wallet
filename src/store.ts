import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface XpubState {
  value: string;
}

const initialState: XpubState = { value: '' };
const xpubSlice = createSlice({
  name: 'xpub',
  initialState,
  reducers: {
    setXpub: (state, action: PayloadAction<string>) => {
      state.value = action.payload;
    },
  },
});

export const { setXpub } = xpubSlice.actions;

export const store = configureStore({
  reducer: {
    xpub: xpubSlice.reducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
