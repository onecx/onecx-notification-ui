import {
  AppStateService,
  ConfigurationService,
  PortalApiConfiguration,
} from '@onecx/portal-integration-angular';
import { environment } from 'src/environments/environment';
import { Configuration } from '../generated';

export function apiConfigProvider(
  configService: ConfigurationService,
  appStateService: AppStateService
) {
  return new PortalApiConfiguration(
    Configuration,
    environment.apiPrefix,
    configService,
    appStateService
  );
}
