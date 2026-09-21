import { CommonModule } from '@angular/common'
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, Subject } from 'rxjs'

import { AuthProxyService } from '@onecx/angular-auth'
import { UserService } from '@onecx/angular-integration-interface'
import { FakeTopic } from '@onecx/angular-integration-interface/mocks'
import { RemoteComponentConfig } from '@onecx/angular-remote-components'

import {
  Notification,
  NotificationTopic,
  OneCXNotificationConnectorComponent,
  RawNotification
} from './notification-connector.component'

describe('OneCXNotificationConnectorComponent', () => {
  let component: OneCXNotificationConnectorComponent
  let authServiceMock: { updateTokenIfNeeded: jest.Mock; getHeaderValues: jest.Mock }
  let userServiceMock: { profile$: BehaviorSubject<{ userId: string }> }
  let fakeTopic: FakeTopic<Notification>
  let loggerMock: { debug: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock }
  let mockSocketClient: { connect: jest.Mock; send: jest.Mock; close: jest.Mock; stream$: Subject<RawNotification> }

  const flushPromises = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const mockConfig: RemoteComponentConfig = {
    appId: 'appId',
    productName: 'productName',
    permissions: ['permission'],
    baseUrl: 'http://localhost:8080'
  }

  const createMockSocketClient = () => {
    const stream$ = new Subject<RawNotification>()
    return {
      stream$,
      connect: jest.fn().mockReturnValue(stream$.asObservable()),
      send: jest.fn(),
      close: jest.fn()
    }
  }

  beforeEach(async () => {
    authServiceMock = {
      updateTokenIfNeeded: jest.fn().mockResolvedValue(undefined),
      getHeaderValues: jest.fn().mockReturnValue({ Authorization: 'Bearer mock-token' })
    }

    userServiceMock = {
      profile$: new BehaviorSubject({ userId: 'test-user' })
    }

    await TestBed.configureTestingModule({
      imports: [OneCXNotificationConnectorComponent, CommonModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthProxyService, useValue: authServiceMock },
        { provide: UserService, useValue: userServiceMock }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    component = fixture.componentInstance

    fakeTopic = new FakeTopic<Notification>()
    component['_notificationTopic'] = fakeTopic as unknown as NotificationTopic

    loggerMock = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
    Object.defineProperty(component, 'logger', {
      value: loggerMock,
      configurable: true
    })

    mockSocketClient = createMockSocketClient()
    jest.spyOn<any, any>(component, 'recreateSockJsClient').mockImplementation(() => {
      component['sockJsClient'] = mockSocketClient as any
      return mockSocketClient as any
    })

    fixture.detectChanges()
  })

  afterEach(() => {
    component.ngOnDestroy()
    mockSocketClient.stream$.complete()
    userServiceMock.profile$.complete()
    jest.restoreAllMocks()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })

  it('should delegate config setter to ocxInitRemoteComponent', () => {
    const initSpy = jest.spyOn(component, 'ocxInitRemoteComponent')

    component.ocxRemoteComponentConfig = mockConfig

    expect(initSpy).toHaveBeenCalledWith(mockConfig)
  })

  it('should use /bff/eventbus url for websocket init', () => {
    const connectSpy = jest.spyOn<any, any>(component, 'connectWebSocket')

    component.ocxInitRemoteComponent(mockConfig)

    expect(connectSpy).toHaveBeenCalledWith('http://localhost:8080/bff/eventbus')
  })

  it('should build url correctly when baseUrl ends with slash', () => {
    const connectSpy = jest.spyOn<any, any>(component, 'connectWebSocket')
    const configWithSlash: RemoteComponentConfig = { ...mockConfig, baseUrl: 'http://localhost:8080/' }

    component.ocxInitRemoteComponent(configWithSlash)

    expect(connectSpy).toHaveBeenCalledWith('http://localhost:8080/bff/eventbus')
  })

  it('should update token and connect using auth headers and profile', async () => {
    component.ocxInitRemoteComponent(mockConfig)
    await flushPromises()

    expect(authServiceMock.updateTokenIfNeeded).toHaveBeenCalled()
    expect(authServiceMock.getHeaderValues).toHaveBeenCalled()
    expect(component['recreateSockJsClient']).toHaveBeenCalledWith('test-user', 'mock-token')
    expect(mockSocketClient.connect).toHaveBeenCalledWith('http://localhost:8080/bff/eventbus')
  })

  it('should publish only rec notifications and parse payload body', async () => {
    const publishSpy = jest.spyOn(fakeTopic, 'publish')

    component.ocxInitRemoteComponent(mockConfig)
    await flushPromises()

    mockSocketClient.stream$.next({
      type: 'register',
      address: 'notifications.onecx.new.test-user',
      authHeaders: { Authorization: 'Bearer mock-token' }
    } as any)

    const rawNotification: RawNotification = {
      type: 'rec',
      address: 'address',
      headers: {},
      body: JSON.stringify({
        id: '1',
        applicationId: 'appId',
        senderId: 'senderId',
        receiverId: 'receiverId',
        persist: true,
        creationData: '2026-01-01T00:00:00.000Z',
        contentMeta: [{ key: 'key1', value: 'value1' }]
      })
    }

    mockSocketClient.stream$.next(rawNotification)

    expect(publishSpy).toHaveBeenCalledTimes(1)
    expect(publishSpy).toHaveBeenCalledWith({
      ...rawNotification,
      body: {
        id: '1',
        applicationId: 'appId',
        senderId: 'senderId',
        receiverId: 'receiverId',
        persist: true,
        creationData: '2026-01-01T00:00:00.000Z',
        contentMeta: [{ key: 'key1', value: 'value1' }]
      }
    })
    expect(loggerMock.info).toHaveBeenCalledWith('Received notification(rec):', {
      ...rawNotification,
      body: {
        id: '1',
        applicationId: 'appId',
        senderId: 'senderId',
        receiverId: 'receiverId',
        persist: true,
        creationData: '2026-01-01T00:00:00.000Z',
        contentMeta: [{ key: 'key1', value: 'value1' }]
      }
    })
  })

  it('should log reconnect message when websocket stream errors', async () => {
    component.ocxInitRemoteComponent(mockConfig)
    await flushPromises()

    mockSocketClient.stream$.error(new Error('websocket failure'))
    await flushPromises()

    expect(loggerMock.error).toHaveBeenCalledWith('WebSocket error, reconnecting in 5000ms...', expect.any(Error))
  })

  it('should call topic destroy and socket close on destroy', async () => {
    const destroySpy = jest.spyOn(fakeTopic, 'destroy')

    component.ocxInitRemoteComponent(mockConfig)
    await flushPromises()

    component.ngOnDestroy()

    expect(mockSocketClient.close).toHaveBeenCalled()
    expect(destroySpy).toHaveBeenCalled()
  })

  it('should initialize NotificationTopic with proper values', () => {
    const topic = new NotificationTopic()

    expect(topic).toBeInstanceOf(NotificationTopic)
    expect(topic['name']).toBe('notification')
  })

  it('should connect without authorization header when not available', async () => {
    authServiceMock.getHeaderValues.mockReturnValue({})

    component.ocxInitRemoteComponent(mockConfig)
    await flushPromises()

    expect(authServiceMock.getHeaderValues).toHaveBeenCalled()
    expect(component['recreateSockJsClient']).toHaveBeenCalledWith('test-user', '')
    expect(mockSocketClient.connect).toHaveBeenCalledWith('http://localhost:8080/bff/eventbus')
  })

  describe('recreateSockJsClient', () => {
    let SockJsModule: any
    let clientSpy: any
    let sendMock: jest.Mock
    let capturedConfig: any
    let compModule: any
    let recreateFn: any

    beforeEach(() => {
      jest.resetModules()
      SockJsModule = require('../../shared/utils/sockjs.utils')
      sendMock = jest.fn()
      clientSpy = { send: sendMock, close: jest.fn() }
      capturedConfig = undefined
      jest.spyOn(SockJsModule, 'SockJsRxClient').mockImplementation(function (this: any, config: any) {
        capturedConfig = config
        return clientSpy
      })

      compModule = require('./notification-connector.component')
      recreateFn = compModule.OneCXNotificationConnectorComponent.prototype.recreateSockJsClient
    })

    it('calls send(register) on open with correct payload', () => {
      const ctx: any = Object.create(compModule.OneCXNotificationConnectorComponent.prototype)
      ctx.logger = { info: jest.fn() }

      recreateFn.call(ctx, 'uid-999', 'tok-abc')
      capturedConfig.onOpen()

      expect(sendMock).toHaveBeenCalledWith({
        type: 'register',
        address: 'notifications.onecx.new.uid-999',
        token: 'tok-abc'
      })
    })

    it('logs on close via logger.info', () => {
      const ctx: any = Object.create(compModule.OneCXNotificationConnectorComponent.prototype)
      ctx.logger = { info: jest.fn() }

      recreateFn.call(ctx, 'uid-000', 'tok-zzz')
      capturedConfig.onClose()

      expect(ctx.logger.info).toHaveBeenCalledWith('WebSocket connection closed')
    })
  })
})
