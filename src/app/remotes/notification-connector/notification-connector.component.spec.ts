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

class DeferredBroadcastChannel implements BroadcastChannel {
  public onmessage: ((this: BroadcastChannel, event: MessageEvent) => unknown) | null = null
  public onmessageerror: ((this: BroadcastChannel, event: MessageEvent) => unknown) | null = null
  public onopen: ((this: BroadcastChannel, event: Event) => unknown) | null = null
  public onclose: ((this: BroadcastChannel, event: Event) => unknown) | null = null
  public readonly messages: unknown[] = []
  public closed = false
  public eventListenerCount = 0
  public started = false
  constructor(public readonly name: string) {}
  close(): void {
    this.closed = true
  }
  postMessage(message: unknown): void {
    this.messages.push(message)
  }
  addEventListener(): void {
    this.eventListenerCount++
  }
  removeEventListener(): void {
    this.eventListenerCount--
  }
  dispatchEvent(): boolean {
    return true
  }
  start(): void {
    this.started = true
  }
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
  let sendSpy: jest.SpyInstance<void, [message: RegisterFrame]>
  let originalStorageDescriptor: PropertyDescriptor | undefined
  let originalBroadcastChannelDescriptor: PropertyDescriptor | undefined

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
    loggerMock = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
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
    userServiceMock = {
      profile$: new BehaviorSubject({ userId: 'test-user' })
    }
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

    connectSpy = jest.spyOn(SockJsRxClient.prototype, 'connect').mockImplementation((url: string) => {
      const stream = new Subject<RawNotification | RegisterFrame>()
      socketStreams.push(stream)
      return stream.asObservable()
    })
    sendSpy = jest.spyOn(SockJsRxClient.prototype, 'send').mockImplementation((message: RegisterFrame) => {
      sentMessages.push(message)
    })
    jest.spyOn(SockJsRxClient.prototype, 'close').mockImplementation(() => undefined)
  })

  it('should ignore register frames received from the server', async () => {
    initFixture()
    const publishSpy = jest.spyOn(fakeTopic, 'publish')
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()

    socketStreams[0]?.next({
      type: 'register',
      address: 'notifications.onecx.new.test-user',
      token: 'mock-token',
      sessionId: 'session'
    })

    expect(publishSpy).not.toHaveBeenCalled()
  })

  afterEach(() => {
    fixture?.destroy()
    socketStreams.forEach((stream) => stream.complete())
    userServiceMock.profile$.complete()
    jest.restoreAllMocks()
    if (originalStorageDescriptor) Object.defineProperty(window, 'sessionStorage', originalStorageDescriptor)
    else Reflect.deleteProperty(window, 'sessionStorage')
    if (originalBroadcastChannelDescriptor) {
      Object.defineProperty(globalThis, 'BroadcastChannel', originalBroadcastChannelDescriptor)
    } else {
      delete (globalThis as Partial<typeof globalThis>).BroadcastChannel
    }
    jest.useRealTimers()
  })

  it('should create the connector component', () => {
    initFixture()

    expect(component).toBeTruthy()
  })

  it('should delegate the remote config setter to initialization', () => {
    initFixture()
    const initSpy = jest.spyOn(component, 'ocxInitRemoteComponent')

    component.ocxRemoteComponentConfig = mockConfig

    expect(initSpy).toHaveBeenCalledWith(mockConfig)
  })

  it('should connect to the event bus URL with or without a trailing slash', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    component.ocxInitRemoteComponent({ ...mockConfig, baseUrl: 'http://localhost:8080/' })

    await settlePromises()
    expect(connectSpy).toHaveBeenCalledWith('http://localhost:8080/bff/eventbus')
    expect(connectSpy).toHaveBeenCalledTimes(2)
  })

  it('should update the token and create a socket connection using the current profile', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()

    expect(authServiceMock.updateTokenIfNeeded).toHaveBeenCalled()
    expect(authServiceMock.getHeaderValues).toHaveBeenCalled()
    expect(connectSpy).toHaveBeenCalledWith('http://localhost:8080/bff/eventbus')
  })

  it('should include the stable session ID in every register frame', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()
    triggerSocketOpen()

    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sentMessages[0]).toEqual({
      type: 'register',
      address: 'notifications.onecx.new.test-user',
      token: 'mock-token',
      sessionId: expect.stringMatching(/^[a-f0-9]{32}$/)
    })
    expect(sentMessages[1]).toEqual(sentMessages[0])
  })

  it('should reuse the session ID after the socket reconnects', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()
    const initialSessionId = sentMessages[0]?.sessionId

    jest.useFakeTimers()
    socketStreams[0]?.error(new Error('socket failure'))
    await jest.advanceTimersByTimeAsync(5000)
    await settlePromises()
    triggerSocketOpen()

    expect(connectSpy).toHaveBeenCalledTimes(2)
    expect(sentMessages[1]?.sessionId).toBe(initialSessionId)
  })

  it('should not create the socket before the session identity resolves', async () => {
    originalBroadcastChannelDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
    Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: DeferredBroadcastChannel })
    jest.useFakeTimers()
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await Promise.resolve()

    expect(connectSpy).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(250)
    await settlePromises()

    expect(connectSpy).toHaveBeenCalledTimes(1)
  })

  it('should not create a socket when destroyed during identity resolution', async () => {
    originalBroadcastChannelDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
    Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: DeferredBroadcastChannel })
    jest.useFakeTimers()
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await Promise.resolve()

    fixture.destroy()
    await jest.advanceTimersByTimeAsync(500)
    await Promise.resolve()

    expect(connectSpy).not.toHaveBeenCalled()
  })

  it('should not register after the connector has been destroyed', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    fixture.destroy()

    triggerSocketOpen()

    expect(sentMessages).toHaveLength(0)
  })

  it('should register successfully when session storage is unavailable', async () => {
    originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage unavailable')
      }
    })
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()

    expect(connectSpy).toHaveBeenCalledTimes(1)
    expect(sentMessages[0]?.sessionId).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should publish parsed rec payloads unchanged on NotificationTopic', async () => {
    initFixture()
    const publishSpy = jest.spyOn(fakeTopic, 'publish')
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
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

    socketStreams[0]?.next(rawNotification)

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
  })

  it('should log when publishing a notification fails', async () => {
    initFixture()
    const error = new Error('topic unavailable')
    jest.spyOn(fakeTopic, 'publish').mockRejectedValue(error)
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    socketStreams[0]?.next({ type: 'rec', address: 'address', headers: {}, body: '{}' })
    await Promise.resolve()

    expect(consoleErrorSpy).toHaveBeenCalledWith(error)
  })

  it('should log reconnect information after the socket stream errors', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()

    socketStreams[0]?.error(new Error('websocket failure'))

    expect(loggerMock.error).toHaveBeenCalledWith('WebSocket error, reconnecting in 5000ms...', expect.any(Error))
  })

  it('should log when the socket closes', async () => {
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()

    component['sockJsClient']?.['config'].onClose?.(new CloseEvent('close'))

    expect(loggerMock.info).toHaveBeenCalledWith('WebSocket connection closed')
  })

  it('should connect without an authorization header when none is provided', async () => {
    authServiceMock.getHeaderValues.mockReturnValue({})
    initFixture()
    component.ocxInitRemoteComponent(mockConfig)
    await settlePromises()
    triggerSocketOpen()

    expect(loggerMock.warn).toHaveBeenCalledWith('Authorization header missing when registering WebSocket connection')
    expect(sentMessages[0]?.token).toBe('')
  })

  it('should initialize NotificationTopic with the notification topic name', () => {
    const topic = new NotificationTopic()

    expect(topic).toBeInstanceOf(NotificationTopic)
    expect(topic['name']).toBe('notification')
  })
})
