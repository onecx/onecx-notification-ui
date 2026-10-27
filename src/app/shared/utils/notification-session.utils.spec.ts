import { NotificationSessionIdentity, NotificationSessionIdentityOptions } from './notification-session.utils'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

class FakeLockManager implements LockManager {
  private readonly held = new Set<string>()
  private readonly waiters = new Map<string, Array<() => void>>()

  async query(): Promise<LockManagerSnapshot> {
    return {}
  }

  request<T>(name: string, callback: LockGrantedCallback): Promise<T>
  request<T>(name: string, options: LockOptions, callback: LockGrantedCallback): Promise<T>
  request<T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback,
    optionalCallback?: LockGrantedCallback
  ): Promise<T> {
    const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : optionalCallback!
    if (this.held.has(name)) {
      if (options?.ifAvailable) return Promise.resolve(callback(null) as T)
      return new Promise<T>((resolve, reject) => {
        const grant = () => {
          options?.signal?.removeEventListener('abort', abort)
          this.grant<T>(name, callback).then(resolve, reject)
        }
        const abort = () => {
          const waiters = this.waiters.get(name)
          const index = waiters?.indexOf(grant) ?? -1
          if (index >= 0) waiters?.splice(index, 1)
          reject(new DOMException('Lock request aborted', 'AbortError'))
        }
        if (options?.signal?.aborted) {
          abort()
          return
        }
        options?.signal?.addEventListener('abort', abort, { once: true })
        const waiters = this.waiters.get(name) ?? []
        waiters.push(grant)
        this.waiters.set(name, waiters)
      })
    }

    return this.grant(name, callback)
  }

  private grant<T>(name: string, callback: LockGrantedCallback): Promise<T> {
    this.held.add(name)
    const lock = { name, mode: 'exclusive' } as Lock
    return Promise.resolve(callback(lock) as T).finally(() => {
      this.held.delete(name)
      const next = this.waiters.get(name)?.shift()
      next?.()
    })
  }
}

class RejectingLockManager extends FakeLockManager {
  override request<T>(name: string, callback: LockGrantedCallback): Promise<T>
  override request<T>(name: string, options: LockOptions, callback: LockGrantedCallback): Promise<T>
  override request<T>(
    _name: string,
    _optionsOrCallback: LockOptions | LockGrantedCallback,
    _optionalCallback?: LockGrantedCallback
  ): Promise<T> {
    return Promise.reject(new Error('lock request rejected'))
  }
}

class RejectingNoLockManager extends FakeLockManager {
  private requests = 0

  override request<T>(name: string, callback: LockGrantedCallback): Promise<T>
  override request<T>(name: string, options: LockOptions, callback: LockGrantedCallback): Promise<T>
  override request<T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback,
    optionalCallback?: LockGrantedCallback
  ): Promise<T> {
    if (this.requests++ > 0) {
      return typeof optionsOrCallback === 'function'
        ? super.request<T>(name, optionsOrCallback)
        : super.request<T>(name, optionsOrCallback, optionalCallback!)
    }
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : optionalCallback!
    return Promise.resolve(callback(null) as T).then(() => Promise.reject(new Error('lock result rejected')))
  }
}

class ThrowingLockManager extends FakeLockManager {
  override request<T>(name: string, callback: LockGrantedCallback): Promise<T>
  override request<T>(name: string, options: LockOptions, callback: LockGrantedCallback): Promise<T>
  override request<T>(
    _name: string,
    _optionsOrCallback: LockOptions | LockGrantedCallback,
    _optionalCallback?: LockGrantedCallback
  ): Promise<T> {
    throw new Error('lock API threw')
  }
}

class CollisionThenRejectLockManager extends FakeLockManager {
  private requests = 0

  override request<T>(name: string, callback: LockGrantedCallback): Promise<T>
  override request<T>(name: string, options: LockOptions, callback: LockGrantedCallback): Promise<T>
  override request<T>(
    _name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback,
    optionalCallback?: LockGrantedCallback
  ): Promise<T> {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : optionalCallback!
    if (this.requests++ === 0) return Promise.resolve(callback(null) as T)
    return Promise.reject(new Error('lock request rejected after collision'))
  }
}

class DeferredLockManager extends FakeLockManager {
  override request<T>(name: string, callback: LockGrantedCallback): Promise<T>
  override request<T>(name: string, options: LockOptions, callback: LockGrantedCallback): Promise<T>
  override request<T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback,
    optionalCallback?: LockGrantedCallback
  ): Promise<T> {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : optionalCallback!
    const lock = { name, mode: 'exclusive' } as Lock
    return Promise.resolve().then(() => callback(lock) as T)
  }
}

class FakeBroadcastChannel implements BroadcastChannel {
  private static readonly channels = new Map<string, Set<FakeBroadcastChannel>>()
  public onmessage: ((this: BroadcastChannel, event: MessageEvent) => unknown) | null = null
  public onmessageerror: ((this: BroadcastChannel, event: MessageEvent) => unknown) | null = null
  public onopen: ((this: BroadcastChannel, event: Event) => unknown) | null = null
  public onclose: ((this: BroadcastChannel, event: Event) => unknown) | null = null
  public readonly messages: unknown[] = []
  public closed = false
  public eventListenerCount = 0
  public started = false

  constructor(public readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) ?? new Set<FakeBroadcastChannel>()
    channels.add(this)
    FakeBroadcastChannel.channels.set(name, channels)
  }

  static clear(): void {
    FakeBroadcastChannel.channels.clear()
  }

  static getAll(name: string): FakeBroadcastChannel[] {
    return [...(FakeBroadcastChannel.channels.get(name) ?? [])]
  }

  close(): void {
    this.closed = true
    FakeBroadcastChannel.channels.get(this.name)?.delete(this)
  }

  postMessage(message: unknown): void {
    this.messages.push(message)
    for (const channel of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this && !channel.closed) {
        channel.onmessage?.call(channel, { data: message } as MessageEvent)
      }
    }
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

describe('NotificationSessionIdentity', () => {
  let counter: number

  const makeOptions = (
    overrides: Partial<NotificationSessionIdentityOptions> = {}
  ): NotificationSessionIdentityOptions => ({
    fillRandomValues: (values) => {
      values.fill(counter++)
      return values
    },
    logger: { warn: jest.fn() },
    ...overrides
  })

  beforeEach(() => {
    counter = 1
    FakeBroadcastChannel.clear()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('should construct without explicit options', () => {
    const identity = new NotificationSessionIdentity()

    expect(identity.getCurrentId()).toBeUndefined()
    identity.destroy()
  })

  it('should retain the stored ID after a simulated reload', async () => {
    const storage = new MemoryStorage()
    const lockManager = new FakeLockManager()
    const firstRuntime = new NotificationSessionIdentity(makeOptions({ getStorage: () => storage, lockManager }))
    const firstId = await firstRuntime.resolveId()
    firstRuntime.destroy()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const reloadedRuntime = new NotificationSessionIdentity(makeOptions({ getStorage: () => storage, lockManager }))
    const reloadedId = await reloadedRuntime.resolveId()

    expect(reloadedId).toBe(firstId)
    reloadedRuntime.destroy()
  })

  it('should reuse the ID when a connector is recreated before its lock is released', async () => {
    const storage = new MemoryStorage()
    const lockManager = new FakeLockManager()
    const firstRuntime = new NotificationSessionIdentity(makeOptions({ getStorage: () => storage, lockManager }))
    const originalId = await firstRuntime.resolveId()

    firstRuntime.destroy()
    const recreatedRuntime = new NotificationSessionIdentity(makeOptions({ getStorage: () => storage, lockManager }))

    expect(await recreatedRuntime.resolveId()).toBe(originalId)
    recreatedRuntime.destroy()
  })

  it('should assign a distinct ID to a new tab with empty storage', async () => {
    const lockManager = new FakeLockManager()
    const firstTab = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => new MemoryStorage(), lockManager })
    )
    const secondTab = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => new MemoryStorage(), lockManager })
    )

    const firstId = await firstTab.resolveId()
    const secondId = await secondTab.resolveId()

    expect(secondId).not.toBe(firstId)
    firstTab.destroy()
    secondTab.destroy()
  })

  it('should generate a different ID for copied storage while the original owns it', async () => {
    const lockManager = new FakeLockManager()
    const incumbentStorage = new MemoryStorage()
    const incumbent = new NotificationSessionIdentity(makeOptions({ getStorage: () => incumbentStorage, lockManager }))
    const originalId = await incumbent.resolveId()
    const duplicateStorage = new MemoryStorage()
    duplicateStorage.setItem('onecx.notification.sessionId', originalId)
    const duplicate = new NotificationSessionIdentity(makeOptions({ getStorage: () => duplicateStorage, lockManager }))

    const duplicateResolution = duplicate.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    const duplicateId = await duplicateResolution

    expect(duplicateId).not.toBe(originalId)
    expect(await incumbent.resolveId()).toBe(originalId)
    expect(duplicateStorage.getItem('onecx.notification.sessionId')).toBe(duplicateId)
    incumbent.destroy()
    duplicate.destroy()
  })

  it('should cache a single resolution result', async () => {
    const identity = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => new MemoryStorage(), lockManager: new FakeLockManager() })
    )
    const firstResolution = identity.resolveId()

    expect(identity.resolveId()).toBe(firstResolution)
    identity.destroy()
    await firstResolution
  })

  it('should resolve an ID when storage access throws', async () => {
    const warn = jest.fn()
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => {
          throw new Error('storage blocked')
        },
        lockManager: new FakeLockManager(),
        logger: { warn }
      })
    )

    expect(await identity.resolveId()).toMatch(/^[a-f0-9]{32}$/)
    expect(warn).toHaveBeenCalledWith(
      'Session storage unavailable for notification session identity',
      expect.any(Error)
    )
    identity.destroy()
  })

  it('should ignore a lock request rejection after an unavailable lock was reported', async () => {
    const warn = jest.fn()
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        lockManager: new RejectingNoLockManager(),
        createBroadcastChannel: (name) => new FakeBroadcastChannel(name),
        logger: { warn }
      })
    )
    const resolution = identity.resolveId()

    await jest.advanceTimersByTimeAsync(250)

    expect(await resolution).toMatch(/^[a-f0-9]{32}$/)
    expect(warn).toHaveBeenCalledWith('Web Lock request failed for notification session identity', expect.any(Error))
    identity.destroy()
  })

  it('should retain an ID when storage reads and writes throw', async () => {
    const warn = jest.fn()
    const storage: Storage = {
      get length() {
        return 0
      },
      clear: jest.fn(),
      getItem: jest.fn(() => {
        throw new Error('read denied')
      }),
      key: jest.fn(() => null),
      removeItem: jest.fn(),
      setItem: jest.fn(() => {
        throw new Error('write denied')
      })
    }
    const identity = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => storage, lockManager: new FakeLockManager(), logger: { warn } })
    )

    expect(await identity.resolveId()).toMatch(/^[a-f0-9]{32}$/)
    expect(warn).toHaveBeenCalledWith(
      'Unable to read notification session identity from session storage',
      expect.any(Error)
    )
    expect(warn).toHaveBeenCalledWith(
      'Unable to persist notification session identity in session storage',
      expect.any(Error)
    )
    identity.destroy()
  })

  it('should arbitrate simultaneous copied-tab claims over BroadcastChannel', async () => {
    const storageOne = new MemoryStorage()
    const storageTwo = new MemoryStorage()
    const incumbentId = 'a'.repeat(32)
    storageOne.setItem('onecx.notification.sessionId', incumbentId)
    storageTwo.setItem('onecx.notification.sessionId', incumbentId)
    const createBroadcastChannel = (name: string) => new FakeBroadcastChannel(name)
    const first = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storageOne,
        createBroadcastChannel,
        fillRandomValues: (values) => {
          values.fill(2)
          return values
        }
      })
    )
    const second = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storageTwo,
        createBroadcastChannel,
        fillRandomValues: (values) => {
          values.fill(1)
          return values
        }
      })
    )
    const firstPromise = first.resolveId()
    const secondPromise = second.resolveId()

    await jest.advanceTimersByTimeAsync(1000)
    const [firstId, secondId] = await Promise.all([firstPromise, secondPromise])

    expect(firstId).not.toBe(secondId)
    first.destroy()
    second.destroy()
  })

  it('should notify the other contender when its nonce wins arbitration', async () => {
    const storageOne = new MemoryStorage()
    const storageTwo = new MemoryStorage()
    const incumbentId = 'e'.repeat(32)
    storageOne.setItem('onecx.notification.sessionId', incumbentId)
    storageTwo.setItem('onecx.notification.sessionId', incumbentId)
    const createBroadcastChannel = (name: string) => new FakeBroadcastChannel(name)
    const first = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storageOne,
        createBroadcastChannel,
        fillRandomValues: (values) => {
          values.fill(1)
          return values
        }
      })
    )
    const second = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storageTwo,
        createBroadcastChannel,
        fillRandomValues: (values) => {
          values.fill(2)
          return values
        }
      })
    )
    const firstPromise = first.resolveId()
    const secondPromise = second.resolveId()

    await jest.advanceTimersByTimeAsync(500)
    const [firstId, secondId] = await Promise.all([firstPromise, secondPromise])

    expect(firstId).not.toBe(secondId)
    expect(FakeBroadcastChannel.getAll('onecx.notification.sessionId.claims')[0]?.messages).toContainEqual({
      type: 'winner',
      sessionId: incumbentId,
      to: expect.any(String),
      nonce: expect.any(String)
    })
    first.destroy()
    second.destroy()
  })

  it('should reuse stored identity and answer later claims while it owns the channel', async () => {
    const storage = new MemoryStorage()
    storage.setItem('onecx.notification.sessionId', 'b'.repeat(32))
    const createBroadcastChannel = (name: string) => new FakeBroadcastChannel(name)
    const incumbent = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => storage, createBroadcastChannel, discoveryWindowMs: 250 })
    )
    const incumbentPromise = incumbent.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    const incumbentId = await incumbentPromise
    const incumbentChannel = FakeBroadcastChannel.getAll('onecx.notification.sessionId.claims')[0]
    const duplicateStorage = new MemoryStorage()
    duplicateStorage.setItem('onecx.notification.sessionId', incumbentId)
    const duplicate = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => duplicateStorage, createBroadcastChannel, discoveryWindowMs: 250 })
    )
    const duplicatePromise = duplicate.resolveId()
    await jest.advanceTimersByTimeAsync(500)

    expect(await duplicatePromise).not.toBe(incumbentId)
    expect(incumbentChannel?.messages).toContainEqual({
      type: 'owner',
      sessionId: incumbentId,
      to: expect.any(String)
    })
    incumbent.destroy()
    duplicate.destroy()
  })

  it('should yield to the deterministic winner in a BroadcastChannel collision', async () => {
    const storage = new MemoryStorage()
    storage.setItem('onecx.notification.sessionId', 'd'.repeat(32))
    const channels: FakeBroadcastChannel[] = []
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storage,
        createBroadcastChannel: (name) => {
          const channel = new FakeBroadcastChannel(name)
          channels.push(channel)
          return channel
        }
      })
    )
    const resolution = identity.resolveId()
    const claim = channels[0]?.messages[0] as { sessionId: string; nonce: string }
    channels[0]?.onmessage?.call(channels[0], { data: null } as MessageEvent)
    channels[0]?.onmessage?.call(channels[0], {
      data: { type: 'claim', sessionId: 'unrelated', nonce: 'nonce' }
    } as MessageEvent)
    channels[0]?.onmessage?.call(channels[0], {
      data: { type: 'winner', sessionId: claim.sessionId, to: claim.nonce, nonce: '0'.repeat(32) }
    } as MessageEvent)

    await jest.advanceTimersByTimeAsync(500)

    expect(await resolution).not.toBe('d'.repeat(32))
    identity.destroy()
  })

  it('should use BroadcastChannel when a Web Lock request is rejected', async () => {
    const warn = jest.fn()
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        lockManager: new RejectingLockManager(),
        createBroadcastChannel: (name) => new FakeBroadcastChannel(name),
        logger: { warn }
      })
    )
    const resolution = identity.resolveId()

    await jest.advanceTimersByTimeAsync(250)

    expect(await resolution).toMatch(/^[a-f0-9]{32}$/)
    expect(warn).toHaveBeenCalledWith('Web Lock request failed for notification session identity', expect.any(Error))
    identity.destroy()
  })

  it('should fall back to BroadcastChannel when the Web Lock call throws', async () => {
    const warn = jest.fn()
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        lockManager: new ThrowingLockManager(),
        createBroadcastChannel: (name) => new FakeBroadcastChannel(name),
        logger: { warn }
      })
    )
    const resolution = identity.resolveId()

    await jest.advanceTimersByTimeAsync(250)

    expect(await resolution).toMatch(/^[a-f0-9]{32}$/)
    expect(warn).toHaveBeenCalledWith('Web Lock unavailable for notification session identity', expect.any(Error))
    identity.destroy()
  })

  it('should stop requesting ownership when destroyed while a Web Lock is pending', async () => {
    const identity = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => new MemoryStorage(), lockManager: new DeferredLockManager() })
    )
    const resolution = identity.resolveId()

    identity.destroy()

    expect(await resolution).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should reconcile ownership when the page is restored before its initial identity resolves', async () => {
    const channelInstances: FakeBroadcastChannel[] = []
    const removeEventListenerSpy = jest.spyOn(globalThis.window, 'removeEventListener')
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        createBroadcastChannel: (name) => {
          const channel = new FakeBroadcastChannel(name)
          channelInstances.push(channel)
          return channel
        }
      })
    )
    const resolution = identity.resolveId()
    const pageHideEvent = new Event('pagehide')
    Object.defineProperty(pageHideEvent, 'persisted', { value: true })
    globalThis.window.dispatchEvent(pageHideEvent)
    const pageShowEvent = new Event('pageshow')
    Object.defineProperty(pageShowEvent, 'persisted', { value: true })
    globalThis.window.dispatchEvent(pageShowEvent)

    await jest.advanceTimersByTimeAsync(500)

    expect(await resolution).toMatch(/^[a-f0-9]{32}$/)
    expect(channelInstances).toHaveLength(2)
    expect(channelInstances[0]?.closed).toBe(true)
    identity.destroy()
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pagehide', identity['onPageHide'])
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pageshow', identity['onPageShow'])
    removeEventListenerSpy.mockRestore()
  })

  it('should claim a different Web Lock identity when another tab takes the cached identity', async () => {
    const storage = new MemoryStorage()
    const duplicateStorage = new MemoryStorage()
    const lockManager = new FakeLockManager()
    const onIdChange = jest.fn()
    const original = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => storage, lockManager, onIdChange })
    )
    const originalId = await original.resolveId()
    const pageHideEvent = new Event('pagehide')
    Object.defineProperty(pageHideEvent, 'persisted', { value: true })
    original['onPageHide'](pageHideEvent as PageTransitionEvent)
    for (let index = 0; index < 5; index++) await Promise.resolve()
    duplicateStorage.setItem('onecx.notification.sessionId', originalId)
    const duplicate = new NotificationSessionIdentity(makeOptions({ getStorage: () => duplicateStorage, lockManager }))
    const duplicateResolution = duplicate.resolveId()
    await jest.advanceTimersByTimeAsync(250)

    expect(await duplicateResolution).not.toBe(originalId)
    const pageShowEvent = new Event('pageshow')
    Object.defineProperty(pageShowEvent, 'persisted', { value: true })
    original['onPageShow'](pageShowEvent as PageTransitionEvent)
    await jest.advanceTimersByTimeAsync(0)

    expect(original.getCurrentId()).toBe(originalId)
    expect(duplicate.getCurrentId()).not.toBe(originalId)
    expect(onIdChange).not.toHaveBeenCalled()
    original.destroy()
    duplicate.destroy()
  })

  it('should retain its identity when cross-tab coordination fails during restoration', async () => {
    const storage = new MemoryStorage()
    const warn = jest.fn()
    let channelCalls = 0
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storage,
        createBroadcastChannel: (name) => {
          if (channelCalls++ > 0) throw new Error('channel unavailable')
          return new FakeBroadcastChannel(name)
        },
        logger: { warn }
      })
    )
    const resolution = identity.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    const sessionId = await resolution
    const pageHideEvent = new Event('pagehide')
    Object.defineProperty(pageHideEvent, 'persisted', { value: true })
    identity['onPageHide'](pageHideEvent as PageTransitionEvent)
    const pageShowEvent = new Event('pageshow')
    Object.defineProperty(pageShowEvent, 'persisted', { value: true })
    identity['onPageShow'](pageShowEvent as PageTransitionEvent)
    await jest.advanceTimersByTimeAsync(0)

    expect(identity.getCurrentId()).toBe(sessionId)
    expect(warn).toHaveBeenCalledWith(
      'Cross-tab coordination unavailable while restoring notification session identity',
      expect.any(Error)
    )
    identity.destroy()
  })

  it('should fall back to BroadcastChannel when Web Lock restoration throws', async () => {
    const warn = jest.fn()
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        lockManager: new ThrowingLockManager(),
        createBroadcastChannel: (name) => new FakeBroadcastChannel(name),
        logger: { warn }
      })
    )
    const resolution = identity.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    const sessionId = await resolution
    const pageHideEvent = new Event('pagehide')
    Object.defineProperty(pageHideEvent, 'persisted', { value: true })
    identity['onPageHide'](pageHideEvent as PageTransitionEvent)
    const pageShowEvent = new Event('pageshow')
    Object.defineProperty(pageShowEvent, 'persisted', { value: true })
    identity['onPageShow'](pageShowEvent as PageTransitionEvent)
    await jest.advanceTimersByTimeAsync(250)

    expect(identity.getCurrentId()).toBe(sessionId)
    expect(warn).toHaveBeenCalledWith(
      'Web Lock unavailable while restoring notification session identity',
      expect.any(Error)
    )
    identity.destroy()
  })

  it('should fall back to BroadcastChannel when Web Lock restoration is rejected', async () => {
    const warn = jest.fn()
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        lockManager: new RejectingLockManager(),
        createBroadcastChannel: (name) => new FakeBroadcastChannel(name),
        logger: { warn }
      })
    )
    const resolution = identity.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    const sessionId = await resolution
    identity['onPageHide'](Object.assign(new Event('pagehide'), { persisted: true }) as PageTransitionEvent)
    identity['onPageShow'](Object.assign(new Event('pageshow'), { persisted: true }) as PageTransitionEvent)
    await jest.advanceTimersByTimeAsync(250)

    expect(identity.getCurrentId()).toBe(sessionId)
    expect(warn).toHaveBeenCalledWith('Web Lock request failed for notification session identity', expect.any(Error))
    identity.destroy()
  })

  it('should use a replacement ID when lock and channel coordination fail after a collision', async () => {
    const warn = jest.fn()
    const onIdChange = jest.fn()
    const storage = new MemoryStorage()
    const originalId = 'a'.repeat(32)
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storage,
        lockManager: new CollisionThenRejectLockManager(),
        createBroadcastChannel: () => {
          throw new Error('channel unavailable')
        },
        logger: { warn },
        onIdChange
      })
    )
    identity['sessionId'] = originalId
    storage.setItem('onecx.notification.sessionId', originalId)

    await identity['reclaimOwnership']()

    expect(identity.getCurrentId()).not.toBe(originalId)
    expect(storage.getItem('onecx.notification.sessionId')).toBe(identity.getCurrentId())
    expect(onIdChange).toHaveBeenCalledWith(identity.getCurrentId())
    expect(warn).toHaveBeenCalledWith(
      'Cross-tab coordination unavailable while restoring notification session identity',
      expect.any(Error)
    )
    identity.destroy()
  })

  it('should stop ownership reclamation without a current identity or after destruction', async () => {
    const identity = new NotificationSessionIdentity(makeOptions())

    await identity['reclaimOwnership']()
    identity['sessionId'] = 'stored-session'
    identity.destroy()
    await identity['reclaimOwnership']()

    expect(identity.getCurrentId()).toBe('stored-session')

    const pendingIdentity = new NotificationSessionIdentity(makeOptions({ lockManager: new DeferredLockManager() }))
    pendingIdentity['sessionId'] = 'pending-session'
    const pendingReclaim = pendingIdentity['reclaimOwnership']()
    pendingIdentity.destroy()
    await pendingReclaim
  })

  it('should tolerate a throwing lock-manager accessor and unavailable coordination', async () => {
    const warn = jest.fn()
    const options = makeOptions({
      getStorage: () => new MemoryStorage(),
      createBroadcastChannel: () => {
        throw new Error('channel unavailable')
      },
      logger: { warn }
    })
    Object.defineProperty(options, 'lockManager', {
      get: () => {
        throw new Error('lock manager unavailable')
      }
    })
    const identity = new NotificationSessionIdentity(options)

    expect(await identity.resolveId()).toMatch(/^[a-f0-9]{32}$/)
    expect(warn).toHaveBeenCalledWith(
      'Cross-tab coordination unavailable for notification session identity',
      expect.any(Error)
    )
    identity.destroy()
  })

  it('should retain and persist the stored identity when coordination is unavailable', async () => {
    const warn = jest.fn()
    const storedId = 'c'.repeat(32)
    const storage = new MemoryStorage()
    storage.setItem('onecx.notification.sessionId', storedId)
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storage,
        createBroadcastChannel: () => {
          throw new Error('channel unavailable')
        },
        logger: { warn }
      })
    )

    const sessionId = await identity.resolveId()

    expect(sessionId).toBe(storedId)
    expect(storage.getItem('onecx.notification.sessionId')).toBe(storedId)
    expect(warn).toHaveBeenCalledWith(
      'Cross-tab coordination unavailable for notification session identity',
      expect.any(Error)
    )
    identity.destroy()
  })

  it('should persist a new identity for reload when coordination is unavailable', async () => {
    const storage = new MemoryStorage()
    const options = makeOptions({
      getStorage: () => storage,
      createBroadcastChannel: () => {
        throw new Error('channel unavailable')
      }
    })
    const firstRuntime = new NotificationSessionIdentity(options)
    const firstId = await firstRuntime.resolveId()
    firstRuntime.destroy()

    const reloadedRuntime = new NotificationSessionIdentity(options)

    expect(await reloadedRuntime.resolveId()).toBe(firstId)
    reloadedRuntime.destroy()
  })

  it('should change identity when an owner reply arrives after initial discovery', async () => {
    const storage = new MemoryStorage()
    const channelInstances: FakeBroadcastChannel[] = []
    const onIdChange = jest.fn()
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storage,
        createBroadcastChannel: (name) => {
          const channel = new FakeBroadcastChannel(name)
          channelInstances.push(channel)
          return channel
        },
        onIdChange
      })
    )
    const resolution = identity.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    const originalId = await resolution
    const channel = channelInstances[0]
    const claim = channel?.messages[0] as { nonce: string }

    channel?.onmessage?.call(channel, {
      data: { type: 'owner', sessionId: originalId, to: claim.nonce }
    } as MessageEvent)
    const replacementClaim = channel?.messages.slice(-1)[0] as { sessionId: string; nonce: string }
    channel?.onmessage?.call(channel, {
      data: { type: 'owner', sessionId: replacementClaim.sessionId, to: replacementClaim.nonce }
    } as MessageEvent)
    await jest.advanceTimersByTimeAsync(500)

    expect(identity.getCurrentId()).not.toBe(originalId)
    expect(storage.getItem('onecx.notification.sessionId')).toBe(identity.getCurrentId())
    expect(onIdChange).toHaveBeenCalledWith(identity.getCurrentId())
    identity.destroy()
  })

  it('should stop a replacement claim when destroyed before discovery completes', async () => {
    const storage = new MemoryStorage()
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => storage,
        createBroadcastChannel: (name) => new FakeBroadcastChannel(name),
        onIdChange: jest.fn()
      })
    )
    const resolution = identity.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    const originalId = await resolution
    const replacement = identity['claimReplacementBroadcastId']()
    const duplicateReplacement = identity['claimReplacementBroadcastId']()
    identity.destroy()
    await Promise.all([replacement, duplicateReplacement])

    expect(identity.getCurrentId()).toBe(originalId)
  })

  it('should stop retrying when destroyed while selecting a replacement ID', async () => {
    const channelInstances: FakeBroadcastChannel[] = []
    let randomCalls = 0
    let destroyIdentity: () => void = () => undefined
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        createBroadcastChannel: (name) => {
          const channel = new FakeBroadcastChannel(name)
          channelInstances.push(channel)
          return channel
        },
        fillRandomValues: (values) => {
          values.fill(++randomCalls)
          if (randomCalls === 3) destroyIdentity()
          return values
        }
      })
    )
    destroyIdentity = () => identity.destroy()
    const resolution = identity.resolveId()
    const channel = channelInstances[0]
    const claim = channel?.messages[0] as { sessionId: string; nonce: string }
    channel?.onmessage?.call(channel, {
      data: { type: 'owner', sessionId: claim.sessionId, to: claim.nonce }
    } as MessageEvent)
    await jest.advanceTimersByTimeAsync(250)

    expect(await resolution).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should reclaim ownership when a duplicate claims the ID while the page is cached', async () => {
    const storage = new MemoryStorage()
    const duplicateStorage = new MemoryStorage()
    const channelInstances: FakeBroadcastChannel[] = []
    const onIdChange = jest.fn()
    const duplicateOnIdChange = jest.fn()
    const createBroadcastChannel = (name: string) => {
      const channel = new FakeBroadcastChannel(name)
      channelInstances.push(channel)
      return channel
    }
    const incumbent = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => storage, createBroadcastChannel, onIdChange })
    )
    const incumbentPromise = incumbent.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    const incumbentId = await incumbentPromise
    globalThis.window.dispatchEvent(new Event('pageshow'))
    const pageHideEvent = new Event('pagehide')
    Object.defineProperty(pageHideEvent, 'persisted', { value: true })

    incumbent['onPageHide'](pageHideEvent as PageTransitionEvent)

    duplicateStorage.setItem('onecx.notification.sessionId', incumbentId)
    const duplicate = new NotificationSessionIdentity(
      makeOptions({ getStorage: () => duplicateStorage, createBroadcastChannel, onIdChange: duplicateOnIdChange })
    )
    const duplicatePromise = duplicate.resolveId()
    await jest.advanceTimersByTimeAsync(250)
    expect(await duplicatePromise).toBe(incumbentId)
    const pageShowEvent = new Event('pageshow')
    Object.defineProperty(pageShowEvent, 'persisted', { value: true })
    incumbent['onPageShow'](pageShowEvent as PageTransitionEvent)
    await jest.advanceTimersByTimeAsync(500)

    expect(channelInstances[0]?.closed).toBe(true)
    expect(incumbent.getCurrentId()).toBe(incumbentId)
    expect(duplicate.getCurrentId()).not.toBe(incumbentId)
    expect(storage.getItem('onecx.notification.sessionId')).toBe(incumbentId)
    expect(onIdChange).not.toHaveBeenCalled()
    expect(duplicateOnIdChange).toHaveBeenCalledWith(duplicate.getCurrentId())
    incumbent.destroy()
    duplicate.destroy()
  })

  it('should close the channel and cancel pending ownership discovery on destruction', async () => {
    const channelInstances: FakeBroadcastChannel[] = []
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        createBroadcastChannel: (name) => {
          const channel = new FakeBroadcastChannel(name)
          channelInstances.push(channel)
          return channel
        }
      })
    )
    const resolution = identity.resolveId()

    identity.destroy()

    expect(await resolution).toMatch(/^[a-f0-9]{32}$/)
    expect(channelInstances[0]?.closed).toBe(true)
  })

  it('should not start broadcast ownership after the identity is destroyed', async () => {
    const identity = new NotificationSessionIdentity(makeOptions())
    identity.destroy()

    await expect(identity['claimBroadcastChannel']('destroyed-id')).resolves.toBe('destroyed-id')
  })

  it('should release pending ownership when the page exits', async () => {
    const channelInstances: FakeBroadcastChannel[] = []
    const identity = new NotificationSessionIdentity(
      makeOptions({
        getStorage: () => new MemoryStorage(),
        createBroadcastChannel: (name) => {
          const channel = new FakeBroadcastChannel(name)
          channelInstances.push(channel)
          return channel
        }
      })
    )
    const resolution = identity.resolveId()

    globalThis.window.dispatchEvent(new Event('pagehide'))

    expect(await resolution).toMatch(/^[a-f0-9]{32}$/)
    expect(channelInstances[0]?.closed).toBe(true)
  })
})
