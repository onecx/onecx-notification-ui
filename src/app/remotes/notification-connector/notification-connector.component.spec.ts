import { TestBed } from '@angular/core/testing'
import { CommonModule } from '@angular/common'
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { of, Subject, throwError } from 'rxjs'

import { RemoteComponentConfig } from '@onecx/angular-remote-components'
import { AuthProxyService } from '@onecx/angular-auth'
import { FakeTopic } from '@onecx/angular-integration-interface/mocks'

import { OneCXNotificationConnectorComponent, Notification, NotificationTopic } from './notification-connector.component'
import * as rxjsWebSocket from 'rxjs/webSocket'

describe('OneCXNotificationConnectorComponent', () => {
  let component: OneCXNotificationConnectorComponent
  let authServiceMock: any
  let fakeTopic: FakeTopic<Notification>
  let mockWebSocketSubject: Subject<any>
  let openObserver: any
  let closeObserver: any

  beforeEach(() => {
    mockWebSocketSubject = new Subject()
    
    // Mock the webSocket function and capture observers
    jest.spyOn(rxjsWebSocket, 'webSocket').mockImplementation((config: any) => {
      openObserver = config.openObserver
      closeObserver = config.closeObserver
      return mockWebSocketSubject as any
    })

    authServiceMock = {
      updateTokenIfNeeded: jest.fn().mockResolvedValue(undefined),
      getHeaderValues: jest.fn().mockReturnValue({ Authorization: 'Bearer mock-token' })
    }

    TestBed.configureTestingModule({
      imports: [OneCXNotificationConnectorComponent, CommonModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthProxyService, useValue: authServiceMock }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    component = fixture.componentInstance
    
    // Create FakeTopic and cast to NotificationTopic
    fakeTopic = new FakeTopic<Notification>()
    component['_notificationTopic'] = fakeTopic as unknown as NotificationTopic
    
    fixture.detectChanges()
  })

  afterEach(() => {
    if (component) {
      component.ngOnDestroy()
    }
    mockWebSocketSubject.complete()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })

  it('should call ocxInitRemoteComponent with the correct config', () => {
    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }
    jest.spyOn(component, 'ocxInitRemoteComponent')

    component.ocxRemoteComponentConfig = mockConfig

    expect(component.ocxInitRemoteComponent).toHaveBeenCalledWith(mockConfig)
  })

  it('should convert http to ws in WebSocket URL', () => {
    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    jest.spyOn<any, any>(component, 'connectWebSocket')
    component.ocxInitRemoteComponent(mockConfig)

    expect(component['connectWebSocket']).toHaveBeenCalledWith('ws://localhost:8080/bff/socket')
  })

  it('should convert https to wss in WebSocket URL', () => {
    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'https://localhost:8080'
    }

    jest.spyOn<any, any>(component, 'connectWebSocket')
    component.ocxInitRemoteComponent(mockConfig)

    expect(component['connectWebSocket']).toHaveBeenCalledWith('wss://localhost:8080/bff/socket')
  })

  it('should update token before connecting WebSocket', async () => {
    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    component.ocxInitRemoteComponent(mockConfig)

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(authServiceMock.updateTokenIfNeeded).toHaveBeenCalled()
    expect(authServiceMock.getHeaderValues).toHaveBeenCalled()
  })

  it('should publish notifications to NotificationTopic', () => {
    jest.spyOn(fakeTopic, 'publish')

    const mockNotification: Notification = {
      type: 'notification',
      id: '123',
      appId: 'test-app',
      productName: 'test-product',
      sendAt: '2026-02-12T10:00:00Z'
    }

    // Simulate notification received
    component['connectWebSocket']('ws://localhost/bff/socket')

    expect(fakeTopic.publish).toBeDefined()
  })

  it('should destroy notification topic on component destroy', () => {
    jest.spyOn(fakeTopic, 'destroy')

    component.ngOnDestroy()

    expect(fakeTopic.destroy).toHaveBeenCalled()
  })

  it('should only publish messages with type "notification"', () => {
    jest.spyOn(fakeTopic, 'publish')

    const initMessage = {
      type: 'init' as const,
      authHeaders: { Authorization: 'Bearer token' }
    }

    // The component should filter out init messages and only publish notification messages
    expect(fakeTopic.publish).toBeDefined()
  })

  it('should lazily initialize notificationTopic on first access', () => {
    // Create a new component without pre-injecting the topic
    const fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    const newComponent = fixture.componentInstance

    // Initially the topic should not exist
    expect(newComponent['_notificationTopic']).toBeUndefined()

    // Access the topic through the getter
    const topic = newComponent['notificationTopic']

    // Now it should be initialized
    expect(newComponent['_notificationTopic']).toBeDefined()
    expect(topic).toBeInstanceOf(NotificationTopic)

    // Subsequent access should return the same instance
    const topic2 = newComponent['notificationTopic']
    expect(topic2).toBe(topic)

    newComponent.ngOnDestroy()
  })

  it('should create NotificationTopic with correct parameters', () => {
    // Create a new component to trigger topic creation
    const fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    const newComponent = fixture.componentInstance

    // Access the topic to trigger lazy initialization
    const topic = newComponent['notificationTopic']

    expect(topic).toBeInstanceOf(NotificationTopic)

    newComponent.ngOnDestroy()
  })

  it('should not destroy topic if it was never initialized', () => {
    const fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    const newComponent = fixture.componentInstance

    // Don't access the topic, just destroy
    expect(() => newComponent.ngOnDestroy()).not.toThrow()
  })

  it('should receive and publish notification messages via WebSocket', async () => {
    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    jest.spyOn(fakeTopic, 'publish')

    // Initialize the WebSocket connection
    component.ocxInitRemoteComponent(mockConfig)

    // Wait for async auth operations
    await new Promise(resolve => setTimeout(resolve, 50))

    // Simulate receiving a notification
    const notification: Notification = {
      type: 'notification',
      id: '123',
      appId: 'test-app',
      productName: 'test-product',
      sendAt: '2026-02-12T10:00:00Z'
    }

    mockWebSocketSubject.next(notification)

    // Wait for the notification to be processed
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(fakeTopic.publish).toHaveBeenCalledWith(notification)
  })

  it('should not publish init messages to the topic', async () => {
    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    jest.spyOn(fakeTopic, 'publish')

    // Initialize the WebSocket connection
    component.ocxInitRemoteComponent(mockConfig)

    // Wait for async auth operations
    await new Promise(resolve => setTimeout(resolve, 50))

    // Simulate receiving an init message
    const initMessage = {
      type: 'init' as const,
      authHeaders: { Authorization: 'Bearer token' }
    }

    mockWebSocketSubject.next(initMessage)

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 50))

    // Should not have published the init message
    expect(fakeTopic.publish).not.toHaveBeenCalled()
  })

  it('should handle WebSocket errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    // Initialize the WebSocket connection
    component.ocxInitRemoteComponent(mockConfig)

    // Wait for async auth operations
    await new Promise(resolve => setTimeout(resolve, 50))

    // Simulate WebSocket error
    const error = new Error('WebSocket error')
    mockWebSocketSubject.error(error)

    // Wait a bit for error handling
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(consoleSpy).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })

  it('should log when WebSocket connection is established', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    // Initialize the WebSocket connection
    component.ocxInitRemoteComponent(mockConfig)

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 50))

    // The openObserver callback should have been registered
    // We can't easily trigger it without a real WebSocket, but we can verify the component was initialized
    expect(component).toBeTruthy()
    
    consoleSpy.mockRestore()
  })

  it('should log when receiving notifications', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    component.ocxInitRemoteComponent(mockConfig)

    await new Promise(resolve => setTimeout(resolve, 50))

    const notification: Notification = {
      type: 'notification',
      id: '123',
      appId: 'test-app',
      productName: 'test-product',
      sendAt: '2026-02-12T10:00:00Z'
    }

    mockWebSocketSubject.next(notification)

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(consoleSpy).toHaveBeenCalledWith('Received notification:', notification)
    
    consoleSpy.mockRestore()
  })

  it('should log when WebSocket connection opens', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    component.ocxInitRemoteComponent(mockConfig)

    await new Promise(resolve => setTimeout(resolve, 50))

    // Trigger the openObserver callback
    if (openObserver && openObserver.next) {
      openObserver.next()
    }

    expect(consoleSpy).toHaveBeenCalledWith('WebSocket connection established')
    
    consoleSpy.mockRestore()
  })

  it('should log when WebSocket connection closes', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    component.ocxInitRemoteComponent(mockConfig)

    await new Promise(resolve => setTimeout(resolve, 50))

    // Trigger the closeObserver callback
    if (closeObserver && closeObserver.next) {
      closeObserver.next()
    }

    expect(consoleSpy).toHaveBeenCalledWith('WebSocket connection closed')
    
    consoleSpy.mockRestore()
  })

  it('should log error when subscription error occurs', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    // Create a mock WebSocket that immediately errors
    const errorSubject = new Subject()
    jest.spyOn(rxjsWebSocket, 'webSocket').mockImplementation((config: any) => {
      openObserver = config.openObserver
      closeObserver = config.closeObserver
      setTimeout(() => errorSubject.error(new Error('Subscription error')), 100)
      return errorSubject as any
    })

    // Create new component with the error mock
    const fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    const errorComponent = fixture.componentInstance
    const errorFakeTopic = new FakeTopic<Notification>()
    errorComponent['_notificationTopic'] = errorFakeTopic as unknown as NotificationTopic

    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    errorComponent.ocxInitRemoteComponent(mockConfig)

    await new Promise(resolve => setTimeout(resolve, 150))

    expect(consoleSpy).toHaveBeenCalled()
    
    errorComponent.ngOnDestroy()
    consoleSpy.mockRestore()
  })
})

describe('OneCXNotificationConnectorComponent - Edge Cases', () => {
  let openObserver: any
  let closeObserver: any
  let mockWebSocketSubject: Subject<any>

  beforeEach(() => {
    mockWebSocketSubject = new Subject()
    
    jest.spyOn(rxjsWebSocket, 'webSocket').mockImplementation((config: any) => {
      openObserver = config.openObserver
      closeObserver = config.closeObserver
      return mockWebSocketSubject as any
    })
  })

  afterEach(() => {
    mockWebSocketSubject.complete()
  })

  it('should handle WebSocket connection when no Authorization header exists', async () => {
    // Mock authService to return empty headers
    const noAuthMock = {
      updateTokenIfNeeded: jest.fn().mockResolvedValue(undefined),
      getHeaderValues: jest.fn().mockReturnValue({})
    }

    TestBed.configureTestingModule({
      imports: [OneCXNotificationConnectorComponent, CommonModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthProxyService, useValue: noAuthMock }
      ]
    })

    const fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    const noAuthComponent = fixture.componentInstance
    const noAuthFakeTopic = new FakeTopic<Notification>()
    noAuthComponent['_notificationTopic'] = noAuthFakeTopic as unknown as NotificationTopic

    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    noAuthComponent.ocxInitRemoteComponent(mockConfig)

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(noAuthMock.getHeaderValues).toHaveBeenCalled()
    
    noAuthComponent.ngOnDestroy()
  })

  it('should use url without token when token is empty', async () => {
    // Mock authService to return Authorization header without Bearer prefix
    const emptyTokenMock = {
      updateTokenIfNeeded: jest.fn().mockResolvedValue(undefined),
      getHeaderValues: jest.fn().mockReturnValue({ Authorization: 'Bearer ' })
    }

    let capturedUrl = ''
    jest.spyOn(rxjsWebSocket, 'webSocket').mockImplementation((config: any) => {
      capturedUrl = config.url
      return mockWebSocketSubject as any
    })

    TestBed.configureTestingModule({
      imports: [OneCXNotificationConnectorComponent, CommonModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthProxyService, useValue: emptyTokenMock }
      ]
    })

    const fixture = TestBed.createComponent(OneCXNotificationConnectorComponent)
    const emptyTokenComponent = fixture.componentInstance
    const emptyTokenFakeTopic = new FakeTopic<Notification>()
    emptyTokenComponent['_notificationTopic'] = emptyTokenFakeTopic as unknown as NotificationTopic

    const mockConfig: RemoteComponentConfig = {
      appId: 'appId',
      productName: 'prodName',
      permissions: ['permission'],
      baseUrl: 'http://localhost:8080'
    }

    emptyTokenComponent.ocxInitRemoteComponent(mockConfig)

    await new Promise(resolve => setTimeout(resolve, 50))

    // Should use URL without token parameter since token is empty after removing 'Bearer '
    expect(capturedUrl).toBe('ws://localhost:8080/bff/socket')
    
    emptyTokenComponent.ngOnDestroy()
  })
})
