import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { BehaviorSubject, Observable, Subject } from 'rxjs'

import { AuthProxyService } from '@onecx/angular-auth'
import { UserService } from '@onecx/angular-integration-interface'
import { FakeTopic } from '@onecx/angular-integration-interface/mocks'
import { RemoteComponentConfig } from '@onecx/angular-remote-components'

import { SockJsRxClient } from '../../shared/utils/sockjs.utils'
import {
  Notification,
  NotificationTopic,
  OneCXNotificationConnectorComponent,
  RawNotification
} from './notification-connector.component'

interface RegisterFrame {
  type: 'register'
  address: string
  token: string
  sessionId: string
}

describe('OneCXNotificationConnectorComponent', () => {
  let component: OneCXNotificationConnectorComponent
  let fixture: ComponentFixture<OneCXNotificationConnectorComponent>
  let authServiceMock: { updateTokenIfNeeded: jest.Mock; getHeaderValues: jest.Mock }
  let userServiceMock: { profile$: BehaviorSubject<{ userId: string }> }
  let fakeTopic: FakeTopic<Notification>
  let loggerMock: { debug: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock }
  let socketStreams: Subject<RawNotification | RegisterFrame>[]
  let sentMessages: RegisterFrame[]
  let connectSpy: jest.SpyInstance<Observable<RawNotification | RegisterFrame>, [url: string]>

  const mockConfig: RemoteComponentConfig = {
    appId: 'appId',
    productName: 'productName',
    permissions: ['permission'],
    baseUrl: 'http://localhost:8080'
  }

  const initFixture = (): void => {
    fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    component = fixture.componentInstance
    fakeTopic = new FakeTopic<Notification>()
    component['_notificationTopic'] = fakeTopic as unknown as NotificationTopic
    loggerMock = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    Object.defineProperty(component, 'logger', { value: loggerMock, configurable: true })
    fixture.detectChanges()
  }

  const settlePromises = async (): Promise<void> => {
    await fixture.whenStable()
    for (let index = 0; index < 5; index++) await Promise.resolve()
  }

  const triggerSocketOpen = (): void => {
    component['sockJsClient']?.['config'].onOpen?.()
  }

  beforeEach(async () => {
    authServiceMock = {
      updateTokenIfNeeded: jest.fn().mockResolvedValue(undefined),
      getHeaderValues: jest.fn().mockReturnValue({ Authorization: 'Bearer mock-token' })
    }
    userServiceMock = { profile$: new BehaviorSubject({ userId: 'test-user' }) }
    socketStreams = []
    sentMessages = []

    await TestBed.configureTestingModule({
      imports: [OneCXNotificationConnectorComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthProxyService, useValue: authServiceMock },
        { provide: UserService, useValue: userServiceMock }
      ]
    }).compileComponents()

    connectSpy = jest.spyOn(SockJsRxClient.prototype, 'connect').mockImplementation(() => {
      const stream = new Subject<RawNotification | RegisterFrame>()
      socketStreams.push(stream)
      return stream.asObservable()
    })
    jest.spyOn(SockJsRxClient.prototype, 'send').mockImplementation((message: RegisterFrame) => {
      sentMessages.push(message)
    })
    jest.spyOn(SockJsRxClient.prototype, 'close').mockImplementation(() => undefined)
  })

  afterEach(() => {
    fixture?.destroy()
    for (const stream of socketStreams) stream.complete()
    userServiceMock.profile$.complete()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('should create the connector when its dependencies are provided', () => {
    initFixture()

    expect(component).toBeTruthy()
  })

  it('should initialize when the remote config input is set', () => {
    initFixture()
    const initSpy = jest.spyOn(component, 'ocxInitRemoteComponent')

    fixture.componentRef.setInput('ocxRemoteComponentConfig', mockConfig)
    fixture.detectChanges()

    expect(initSpy).toHaveBeenCalledWith(mockConfig)
  })

  it.each(['http://localhost:8080', 'http://localhost:8080/'])(
    'should connect to the event bus when the base URL is %s',
    async (baseUrl) => {
      initFixture()
      component.ocxInitRemoteComponent({ ...mockConfig, baseUrl })
      await settlePromises()

      expect(connectSpy).toHaveBeenCalledWith('http://localhost:8080/bff/eventbus')
    }
  )

  it('should refresh the token when a connection is created', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()

    expect(authServiceMock.updateTokenIfNeeded).toHaveBeenCalled()
    expect(authServiceMock.getHeaderValues).toHaveBeenCalled()
  })

  it('should include the document ID with unchanged address and token when registering', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()

    expect(sentMessages).toEqual([
      {
        type: 'register',
        address: 'notifications.onecx.new.test-user',
        token: 'mock-token',
        sessionId: expect.stringMatching(/^[a-f0-9]{32}$/)
      }
    ])
  })

  it('should reuse the ID when the socket reconnects after an error', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()
    const originalId = sentMessages[0].sessionId
    jest.useFakeTimers()

    socketStreams[0].error(new Error('socket failure'))
    await jest.advanceTimersByTimeAsync(5000)
    await settlePromises()
    triggerSocketOpen()

    expect(connectSpy).toHaveBeenCalledTimes(2)
    expect(sentMessages[1].sessionId).toBe(originalId)
  })

  it('should reuse the ID when the connector is recreated in the same document', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()
    const originalId = sentMessages[0].sessionId

    fixture.destroy()
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()

    expect(sentMessages[1].sessionId).toBe(originalId)
  })

  it('should share the ID when two connectors exist in the same document', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()
    const secondFixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    try {
      secondFixture.detectChanges()
      secondFixture.componentInstance.ocxInitRemoteComponent(mockConfig)
      await settlePromises()
      secondFixture.componentInstance['sockJsClient']?.['config'].onOpen?.()

      expect(sentMessages[1].sessionId).toBe(sentMessages[0].sessionId)
    } finally {
      secondFixture.destroy()
    }
  })

  it('should not create a socket when destroyed before token refresh completes', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    fixture.destroy()
    await settlePromises()

    expect(connectSpy).not.toHaveBeenCalled()
  })

  it('should not register when the connector has been destroyed', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    fixture.destroy()

    triggerSocketOpen()
    component['sendRegisterMessage']('test-user', 'mock-token')

    expect(sentMessages).toHaveLength(0)
  })

  it('should cancel retries when the connector is destroyed', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    jest.useFakeTimers()
    socketStreams[0].error(new Error('socket failure'))

    fixture.destroy()
    await jest.advanceTimersByTimeAsync(5000)

    expect(connectSpy).toHaveBeenCalledTimes(1)
  })

  it('should register when browser storage is unavailable', async () => {
    jest.spyOn(globalThis, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()

    expect(sentMessages[0].sessionId).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should ignore register frames when they arrive from the server', async () => {
    initFixture()
    const publishSpy = jest.spyOn(fakeTopic, 'publish')
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()

    socketStreams[0].next({ type: 'register', address: 'address', token: 'token', sessionId: 'session' })

    expect(publishSpy).not.toHaveBeenCalled()
  })

  it('should publish the parsed payload unchanged when a rec frame arrives', async () => {
    initFixture()
    const publishSpy = jest.spyOn(fakeTopic, 'publish')
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    const body = {
      id: '1',
      applicationId: 'appId',
      senderId: 'senderId',
      receiverId: 'receiverId',
      persist: true,
      creationData: '2026-01-01T00:00:00.000Z',
      contentMeta: [{ key: 'key1', value: 'value1' }]
    }
    const rawNotification: RawNotification = {
      type: 'rec',
      address: 'address',
      headers: {},
      body: JSON.stringify(body)
    }

    socketStreams[0].next(rawNotification)

    expect(publishSpy).toHaveBeenCalledWith({ ...rawNotification, body })
  })

  it('should log when publishing a notification fails', async () => {
    initFixture()
    const error = new Error('topic unavailable')
    jest.spyOn(fakeTopic, 'publish').mockRejectedValue(error)
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    socketStreams[0].next({ type: 'rec', address: 'address', headers: {}, body: '{}' })
    await Promise.resolve()

    expect(consoleErrorSpy).toHaveBeenCalledWith(error)
  })

  it('should log the retry delay when the socket fails', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    const error = new Error('websocket failure')

    socketStreams[0].error(error)

    expect(loggerMock.error).toHaveBeenCalledWith('WebSocket error, reconnecting in 5000ms...', error)
  })

  it('should log when the socket closes', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()

    component['sockJsClient']?.['config'].onClose?.(new CloseEvent('close'))

    expect(loggerMock.info).toHaveBeenCalledWith('WebSocket connection closed')
  })

  it('should register with an empty token when the authorization header is absent', async () => {
    authServiceMock.getHeaderValues.mockReturnValue({})
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()

    expect(loggerMock.warn).toHaveBeenCalledWith('Authorization header missing when registering WebSocket connection')
    expect(sentMessages[0].token).toBe('')
  })

  it('should use the notification topic name when a topic is created', () => {
    const topic = new NotificationTopic()

    expect(topic['name']).toBe('notification')
    topic.destroy()
  })
})
