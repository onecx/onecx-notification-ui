import { BrowserModule } from '@angular/platform-browser'
import { APP_INITIALIZER, NgModule, isDevMode } from '@angular/core'
import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { AppRoutingModule } from './app-routing.module'
import { AppComponent } from './app.component'
import { AppStateService, APP_CONFIG, ConfigurationService, UserService } from '@onecx/angular-integration-interface'
import { AngularAcceleratorModule, providePortalDialogService } from '@onecx/angular-accelerator'
import { TranslateLoader, TranslateModule } from '@ngx-translate/core'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { CommonModule } from '@angular/common'
import { StoreModule } from '@ngrx/store'
import { reducers, metaReducers } from './app.reducers'
import { StoreDevtoolsModule } from '@ngrx/store-devtools'
import { LetDirective } from '@ngrx/component'
import { EffectsModule } from '@ngrx/effects'
import { StoreRouterConnectingModule } from '@ngrx/router-store'

import { apiConfigProvider } from 'src/app/shared/utils/apiConfigProvider.utils'
import { AngularAuthModule } from '@onecx/angular-auth'
import { Configuration } from 'src/app/shared/generated'
import { createTranslateLoader } from '@onecx/angular-utils'
import { ShellCoreModule } from '@onecx/shell-core'
import { environment } from 'src/environments/environment'

export const commonImports = [CommonModule]

@NgModule({
  declarations: [AppComponent],
  imports: [
    ...commonImports,
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    LetDirective,
    StoreRouterConnectingModule.forRoot(),
    StoreModule.forRoot(reducers, { metaReducers }),
    StoreDevtoolsModule.instrument({
      maxAge: 25,
      logOnly: !isDevMode(),
      autoPause: true,
      trace: false,
      traceLimit: 75
    }),
    EffectsModule.forRoot([]),
    AngularAcceleratorModule,
    AngularAuthModule,
    ShellCoreModule,
    TranslateModule.forRoot({
      isolate: true,
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient, AppStateService]
      }
    })
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    { provide: APP_CONFIG, useValue: environment },
    {
      provide: Configuration,
      useFactory: apiConfigProvider,
      deps: [ConfigurationService, AppStateService]
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
