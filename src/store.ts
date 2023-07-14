import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface XprivState {
  value: string;
}

const initialState: XprivState = { value: '' };
const xprivSlice = createSlice({
  name: 'xpriv',
  initialState,
  reducers: {
    setXpriv: (state, action: PayloadAction<string>) => {
      state.value = action.payload;
    },
  },
});

export const { setXpriv } = xprivSlice.actions;

export const store = configureStore({
  reducer: {
    xpriv: xprivSlice.reducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
