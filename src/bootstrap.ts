import { bootstrapModule } from '@onecx/angular-webcomponents';
import { environment } from 'src/environments/environment';
import { NotificationModule } from './app/notification-app.remote.module';

bootstrapModule(NotificationModule, 'microfrontend', environment.production);
