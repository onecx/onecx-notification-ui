import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideRouter } from '@angular/router'
import { importProvidersFrom } from '@angular/core'
import { AngularAuthModule } from '@onecx/angular-auth'
import { bootstrapRemoteComponent } from '@onecx/angular-webcomponents'
import { environment } from 'src/environments/environment'
import { OneCXNotificationConnectorComponent } from './notification-connector.component'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'

bootstrapRemoteComponent(
  OneCXNotificationConnectorComponent,
  'ocx-notification-connector-component',
  environment.production,
  [
    provideHttpClient(withInterceptorsFromDi()),
    importProvidersFrom(AngularAuthModule),
    importProvidersFrom(BrowserAnimationsModule),
    provideRouter([
      {
        path: '**',
        children: []
      }
    ])
  ]
)
