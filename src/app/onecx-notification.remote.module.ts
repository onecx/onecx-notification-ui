import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { BrowserModule } from '@angular/platform-browser'
import { DoBootstrap, Injector, isDevMode, NgModule, inject, provideAppInitializer } from '@angular/core'
import { StoreRouterConnectingModule } from '@ngrx/router-store'
import { StoreModule } from '@ngrx/store'
import { StoreDevtoolsModule } from '@ngrx/store-devtools'
import { MissingTranslationHandler, TranslateLoader, TranslateModule } from '@ngx-translate/core'
import { AngularAcceleratorMissingTranslationHandler, AngularAcceleratorModule } from '@onecx/angular-accelerator'
import { AppStateService, ConfigurationService } from '@onecx/angular-integration-interface'
import { routes } from './app-routing.module'
import { Router, RouterModule } from '@angular/router'
import { Actions, EffectsModule, EffectsRunner, EffectSources } from '@ngrx/effects'
import { AngularAuthModule } from '@onecx/angular-auth'
import { initializeRouter, createAppEntrypoint } from '@onecx/angular-webcomponents'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { provideNavigatedEventStoreConnector } from '@onecx/ngrx-accelerator'

import { commonImports } from './app.module'
import { AppEntrypointComponent } from './app-entrypoint.component'
import { metaReducers, reducers } from './app.reducers'

import {
  createTranslateLoader,
  provideTranslationPathFromMeta,
  provideThemeConfig,
  provideAngularUtils
} from '@onecx/angular-utils'
import { ShellCoreModule } from '@onecx/shell-core'
import { Configuration } from 'src/app/shared/generated'
import { SharedModule } from 'src/app/shared/shared.module'
import { apiConfigProvider } from 'src/app/shared/utils/apiConfigProvider.utils'

// Workaround for the following issue:
// https://github.com/ngrx/platform/issues/3700
const effectProvidersForWorkaround = [EffectsRunner, EffectSources, Actions]
effectProvidersForWorkaround.forEach((p) => (p.ɵprov.providedIn = null))

@NgModule({
  declarations: [AppEntrypointComponent],
  imports: [
    ...commonImports,
    AngularAcceleratorModule,
    RouterModule.forRoot(routes),
    SharedModule,
    BrowserModule,
    BrowserAnimationsModule,
    AngularAuthModule,
    ShellCoreModule,
    StoreModule.forRoot(reducers, { metaReducers }),
    EffectsModule.forRoot(effectProvidersForWorkaround),
    StoreRouterConnectingModule.forRoot(),
    StoreDevtoolsModule.instrument({
      maxAge: 25, // Retains last 25 states
      logOnly: !isDevMode(), // Restrict extension to log-only mode
      autoPause: true, // Pauses recording actions and state changes when the extension window is not open
      trace: false, //  If set to true, will include stack trace for every dispatched action, so you can see it in trace tab jumping directly to that part of code
      traceLimit: 75 // maximum stack trace frames to be stored (in case trace option was provided as true)
    }),
    TranslateModule.forRoot({
      isolate: true,
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient]
      },
      missingTranslationHandler: {
        provide: MissingTranslationHandler,
        useClass: AngularAcceleratorMissingTranslationHandler
      }
    })
  ],
  exports: [],
  providers: [
    {
      provide: Configuration,
      useFactory: apiConfigProvider,
      deps: [ConfigurationService, AppStateService]
    },
    provideHttpClient(withInterceptorsFromDi()),
    provideTranslationPathFromMeta(import.meta.url, 'assets/i18n/'),
    provideAppInitializer(() => {
      const initializerFn = initializeRouter(inject(Router), inject(AppStateService))
      return initializerFn()
    }),
    provideNavigatedEventStoreConnector(),
    provideThemeConfig(),
    provideAngularUtils()
  ]
})
export class OneCXNotificationModule implements DoBootstrap {
  private injector = inject(Injector)

  ngDoBootstrap(): void {
    createAppEntrypoint(AppEntrypointComponent, 'ocx-notification-component', this.injector)
  }
}
