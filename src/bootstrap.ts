import { bootstrapModule } from '@onecx/angular-webcomponents'

import { environment } from 'src/environments/environment'
import { OneCXNotificationModule } from './app/onecx-notification.remote.module'

void bootstrapModule(OneCXNotificationModule, 'microfrontend', environment.production)
