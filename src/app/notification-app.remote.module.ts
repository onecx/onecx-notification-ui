import { HttpClient, HttpClientModule } from '@angular/common/http';
import {
  APP_INITIALIZER,
  DoBootstrap,
  Injector,
  isDevMode,
  NgModule,
} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Router, RouterModule } from '@angular/router';
import {
  Actions,
  EffectsModule,
  EffectSources,
  EffectsRunner,
} from '@ngrx/effects';
import { StoreRouterConnectingModule } from '@ngrx/router-store';
import { StoreModule } from '@ngrx/store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { AngularAuthModule } from '@onecx/angular-auth';
import {
  createAppEntrypoint,
  initializeRouter,
} from '@onecx/angular-webcomponents';
import { provideNavigatedEventStoreConnector } from '@onecx/ngrx-accelerator';
import {
  addInitializeModuleGuard,
  AppStateService,
  ConfigurationService,
  createTranslateLoader,
  PortalCoreModule,
} from '@onecx/portal-integration-angular';
import { AppEntrypointComponent } from './app-entrypoint.component';
import { routes } from './app-routing.module';
import { commonImports } from './app.module';
import { metaReducers, reducers } from './app.reducers';
import { Configuration } from './shared/generated';
import { SharedModule } from './shared/shared.module';
import { apiConfigProvider } from './shared/utils/apiConfigProvider.utils';

// Workaround for the following issue:
// https://github.com/ngrx/platform/issues/3700
const effectProvidersForWorkaround = [EffectsRunner, EffectSources, Actions];
effectProvidersForWorkaround.forEach((p) => (p.ɵprov.providedIn = null));

@NgModule({
  declarations: [AppEntrypointComponent],
  imports: [
    ...commonImports,
    PortalCoreModule.forMicroFrontend(),
    RouterModule.forRoot(addInitializeModuleGuard(routes)),
    TranslateModule.forRoot({
      extend: true,
      isolate: false,
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient, AppStateService],
      },
    }),
    SharedModule,
    BrowserModule,
    HttpClientModule,
    BrowserAnimationsModule,
    AngularAuthModule,
    StoreModule.forRoot(reducers, { metaReducers }),
    EffectsModule.forRoot(effectProvidersForWorkaround),
    StoreRouterConnectingModule.forRoot(),
    StoreDevtoolsModule.instrument({
      maxAge: 25, // Retains last 25 states
      logOnly: !isDevMode(), // Restrict extension to log-only mode
      autoPause: true, // Pauses recording actions and state changes when the extension window is not open
      trace: false, //  If set to true, will include stack trace for every dispatched action, so you can see it in trace tab jumping directly to that part of code
      traceLimit: 75, // maximum stack trace frames to be stored (in case trace option was provided as true)
    }),
  ],
  exports: [],
  providers: [
    {
      provide: Configuration,
      useFactory: apiConfigProvider,
      deps: [ConfigurationService, AppStateService],
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeRouter,
      multi: true,
      deps: [Router, AppStateService],
    },
    provideNavigatedEventStoreConnector(),
  ],
})
export class NotificationModule implements DoBootstrap {
  constructor(private injector: Injector) {}

  ngDoBootstrap(): void {
    createAppEntrypoint(
      AppEntrypointComponent,
      'notification-webcomponent',
      this.injector
    );
  }
}
