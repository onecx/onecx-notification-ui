import { PortalApiConfiguration } from '@onecx/angular-utils'
import { environment } from 'src/environments/environment'
import { Configuration } from 'src/app/shared/generated'

export function apiConfigProvider() {
  return new PortalApiConfiguration(Configuration, environment.apiPrefix)
}
