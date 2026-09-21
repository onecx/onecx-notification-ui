import { TestBed } from '@angular/core/testing'

import { PortalApiConfiguration } from '@onecx/angular-utils'

import { apiConfigProvider } from './apiConfigProvider.utils'

jest.mock('src/environments/environment', () => ({
  environment: {
    apiPrefix: '/api'
  }
}))
jest.mock('src/app/shared/generated')

describe('apiConfigProvider', () => {
  it('should be defined', () => {
    expect(apiConfigProvider).toBeDefined()
  })

  it('should return a PortalApiConfiguration instance', () => {
    TestBed.configureTestingModule({})

    const result = TestBed.runInInjectionContext(() => apiConfigProvider())

    expect(result).toBeInstanceOf(PortalApiConfiguration)
  })

  it('should use environment apiPrefix from configuration', () => {
    TestBed.configureTestingModule({})

    const result = TestBed.runInInjectionContext(() => apiConfigProvider())

    expect(result).toBeInstanceOf(PortalApiConfiguration)
    expect(result).toBeDefined()
  })
})
