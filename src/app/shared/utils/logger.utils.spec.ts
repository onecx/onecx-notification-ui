import { createLoggerFactory } from './logger.utils'

describe('logger utils', () => {
  it('should throw when libOrAppName is empty', () => {
    expect(() => createLoggerFactory('')).toThrow(
      'createLoggerFactory(libOrAppName): libOrAppName must be a non-empty string.'
    )
  })

  it('should throw when location is empty', () => {
    const createLogger = createLoggerFactory('onecx-notification-ui')

    expect(() => createLogger('')).toThrow('createLogger(location): location must be a non-empty string.')
  })
})
