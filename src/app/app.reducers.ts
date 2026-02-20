import { isDevMode } from '@angular/core';
import { routerReducer } from '@ngrx/router-store';
import { ActionReducerMap, MetaReducer } from '@ngrx/store';
import { oneCxReducer } from '@onecx/ngrx-accelerator';
import { State } from './app.state';

export const reducers: ActionReducerMap<State> = {
  router: routerReducer,
  onecx: oneCxReducer,
};

export const metaReducers: MetaReducer<State>[] = isDevMode() ? [] : [];
