import { createLogger } from './logger.utils'

const SESSION_STORAGE_KEY = 'onecx.notification.sessionId'
const BROADCAST_CHANNEL_NAME = 'onecx.notification.sessionId.claims'
const DISCOVERY_WINDOW_MS = 250

type SessionMessage =
  | { type: 'claim'; sessionId: string; nonce: string }
  | { type: 'owner'; sessionId: string; to: string }
  | { type: 'reclaim'; sessionId: string }
  | { type: 'winner'; sessionId: string; to: string; nonce: string }

/** Injectable browser boundaries make storage and cross-tab behavior deterministic in tests. */
export interface NotificationSessionIdentityOptions {
  getStorage?: () => Storage
  lockManager?: LockManager
  createBroadcastChannel?: (name: string) => BroadcastChannel
  fillRandomValues?: (values: Uint8Array) => Uint8Array
  logger?: { warn: (message: string, ...details: unknown[]) => void }
  discoveryWindowMs?: number
  /** Called when a late owner claim changes the resolved ID. */
  onIdChange?: (sessionId: string) => void
}

/**
 * Resolves one stable notification identity per browser tab runtime.
 *
 * The identity is persisted in tab-scoped session storage and protected against
 * duplicated tabs by a Web Lock or BroadcastChannel claim. Delayed BroadcastChannel
 * claims can replace an already-resolved ID. On back-forward-cache restoration, the
 * incumbent keeps its ID and asks any duplicate using it to rotate. If coordination
 * is unavailable, the stored ID is still reused, but duplicate detection cannot be
 * guaranteed. Call {@link destroy} when the owning connector is destroyed.
 */
export class NotificationSessionIdentity {
  private readonly logger: { warn: (message: string, ...details: unknown[]) => void }
  private resolvePromise?: Promise<string>
  private sessionId?: string
  private broadcastChannel?: BroadcastChannel
  private releaseLock?: () => void
  private abortPendingLock?: () => void
  private cancelDiscovery?: () => void
  private destroyed = false
  private contenderNonce = ''
  private broadcastCandidate = ''
  private broadcastContested = false
  private broadcastResolved = false
  private lateClaimInProgress = false
  private ownershipReconciliationPending = false
  private readonly onPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) {
      this.suspendOwnership()
    } else {
      this.destroy()
    }
  }
  private readonly onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return
    if (!this.sessionId) {
      this.ownershipReconciliationPending = true
      return
    }
    void this.reclaimOwnership()
  }
  private readonly onBroadcastMessage = ({ data }: MessageEvent<SessionMessage>): void => {
    const candidate = this.broadcastCandidate
    if (!data || typeof data !== 'object' || data.sessionId !== candidate) return

    switch (data.type) {
      case 'reclaim':
        this.handleReclaimMessage(candidate)
        break
      case 'claim':
        this.handleClaimMessage(data, candidate)
        break
      case 'owner':
        if (data.to === this.contenderNonce) this.handleBroadcastCollision()
        break
      case 'winner':
        if (data.to === this.contenderNonce && data.nonce < this.contenderNonce && !this.broadcastResolved) {
          this.broadcastContested = true
        }
        break
    }
  }

  private handleReclaimMessage(candidate: string): void {
    if (this.sessionId === candidate && this.broadcastResolved) {
      void this.claimReplacementBroadcastId()
    }
  }

  private handleClaimMessage(data: Extract<SessionMessage, { type: 'claim' }>, candidate: string): void {
    if (this.sessionId === candidate && this.broadcastResolved) {
      this.broadcastChannel?.postMessage({
        type: 'owner',
        sessionId: candidate,
        to: data.nonce
      } satisfies SessionMessage)
    } else if (data.nonce < this.contenderNonce) {
      this.broadcastContested = true
    } else if (data.nonce > this.contenderNonce) {
      this.broadcastChannel?.postMessage({
        type: 'winner',
        sessionId: candidate,
        to: data.nonce,
        nonce: this.contenderNonce
      } satisfies SessionMessage)
    }
  }

  constructor(private readonly options: NotificationSessionIdentityOptions = {}) {
    this.logger = options.logger ?? createLogger('NotificationSessionIdentity')
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide)
      window.addEventListener('pageshow', this.onPageShow)
    }
  }

  /** Returns the cached ID, resolving and claiming tab ownership on first use. */
  public resolveId(): Promise<string> {
    this.resolvePromise ??= this.resolveIdentity().then(async (resolvedId) => {
      if (this.ownershipReconciliationPending && !this.destroyed) {
        this.ownershipReconciliationPending = false
        await this.reclaimOwnership()
      }
      return this.sessionId ?? resolvedId
    })
    return this.resolvePromise
  }

  /** Returns the latest claimed ID, including one assigned after a late tab claim. */
  public getCurrentId(): string | undefined {
    return this.sessionId
  }

  /** Releases the lock/channel without removing the persisted tab identity. */
  public destroy(): void {
    this.destroyed = true
    this.abortPendingLock?.()
    this.abortPendingLock = undefined
    this.releaseLock?.()
    this.releaseLock = undefined
    this.cancelDiscovery?.()
    this.cancelDiscovery = undefined
    this.closeBroadcastChannel()
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide)
      window.removeEventListener('pageshow', this.onPageShow)
    }
  }

  private async resolveIdentity(): Promise<string> {
    const candidate = this.readStoredId() ?? this.createId()
    this.sessionId = await this.claimIdentity(candidate, false)
    this.writeStoredId(this.sessionId)
    return this.sessionId
  }

  private async claimIdentity(candidate: string, restoring: boolean): Promise<string> {
    const lockManager = this.getLockManager()
    if (!lockManager) return this.claimWithBroadcastChannelFallback(candidate, restoring)
    const lockClaim = await this.claimWithWebLock(candidate, lockManager, restoring)
    if (lockClaim.claimed || this.destroyed) return lockClaim.candidate
    return this.claimWithBroadcastChannelFallback(lockClaim.candidate, restoring)
  }

  private async claimWithWebLock(
    candidate: string,
    lockManager: LockManager | undefined,
    restoring: boolean
  ): Promise<{ candidate: string; claimed: boolean }> {
    if (!lockManager) return { candidate, claimed: false }
    try {
      while (!this.destroyed) {
        const claimed = await this.claimWebLock(lockManager, candidate)
        if (claimed === true) return { candidate, claimed: true }
        if (claimed === undefined) break
        candidate = this.createId()
        this.writeStoredId(candidate)
      }
    } catch (error) {
      this.logger.warn(
        restoring
          ? 'Web Lock unavailable while restoring notification session identity'
          : 'Web Lock unavailable for notification session identity',
        error
      )
    }
    return { candidate, claimed: false }
  }

  private async claimWithBroadcastChannelFallback(candidate: string, restoring: boolean): Promise<string> {
    try {
      return await this.claimBroadcastChannel(candidate, restoring)
    } catch (error) {
      this.logger.warn(
        restoring
          ? 'Cross-tab coordination unavailable while restoring notification session identity'
          : 'Cross-tab coordination unavailable for notification session identity',
        error
      )
      return candidate
    }
  }

  private readStoredId(): string | undefined {
    const storage = this.getStorage()
    if (!storage) return undefined

    try {
      const value = storage.getItem(SESSION_STORAGE_KEY)
      return value || undefined
    } catch (error) {
      this.logger.warn('Unable to read notification session identity from session storage', error)
      return undefined
    }
  }

  private writeStoredId(value: string): void {
    const storage = this.getStorage()
    if (!storage) return

    try {
      storage.setItem(SESSION_STORAGE_KEY, value)
    } catch (error) {
      this.logger.warn('Unable to persist notification session identity in session storage', error)
    }
  }

  private getStorage(): Storage | undefined {
    try {
      if (this.options.getStorage) return this.options.getStorage()
      return window.sessionStorage
    } catch (error) {
      this.logger.warn('Session storage unavailable for notification session identity', error)
      return undefined
    }
  }

  private getLockManager(): LockManager | undefined {
    try {
      return this.options.lockManager ?? navigator.locks
    } catch {
      return undefined
    }
  }

  private claimWebLock(lockManager: LockManager, sessionId: string): Promise<boolean | undefined> {
    return new Promise((resolve) => {
      let settled = false
      const controller = new AbortController()
      const abortRequest = () => controller.abort()
      const timeout = setTimeout(abortRequest, DISCOVERY_WINDOW_MS)
      const settle = (value: boolean | undefined) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (this.abortPendingLock === abortRequest) this.abortPendingLock = undefined
        resolve(value)
      }
      this.abortPendingLock = abortRequest

      void lockManager
        .request(`onecx.notification.sessionId.${sessionId}`, { signal: controller.signal }, async (lock) => {
          if (!lock) {
            settle(false)
            return
          }
          if (this.destroyed) {
            settle(false)
            return
          }
          let release!: () => void
          const held = new Promise<void>((resolveHeld) => (release = resolveHeld))
          this.releaseLock = release
          settle(true)
          await held
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            settle(false)
            return
          }
          this.logger.warn('Web Lock request failed for notification session identity', error)
          settle(undefined)
        })
    })
  }

  private async claimBroadcastChannel(candidate: string, reclaiming = false): Promise<string> {
    if (this.destroyed) return candidate
    const createChannel = this.options.createBroadcastChannel ?? ((name) => new BroadcastChannel(name))
    const discoveryWindowMs = this.options.discoveryWindowMs ?? DISCOVERY_WINDOW_MS
    const channel = createChannel(BROADCAST_CHANNEL_NAME)
    this.closeBroadcastChannel()
    this.broadcastChannel = channel
    channel.onmessage = this.onBroadcastMessage
    if (reclaiming) {
      channel.postMessage({ type: 'reclaim', sessionId: candidate } satisfies SessionMessage)
    }

    while (!this.destroyed) {
      this.broadcastCandidate = candidate
      this.contenderNonce = this.createId()
      this.broadcastContested = false
      channel.postMessage({ type: 'claim', sessionId: candidate, nonce: this.contenderNonce } satisfies SessionMessage)
      await this.waitForDiscovery(discoveryWindowMs)

      if (this.destroyed) return candidate
      if (!this.broadcastContested) {
        this.broadcastResolved = true
        return candidate
      }

      candidate = this.createId()
      this.writeStoredId(candidate)
    }

    return candidate
  }

  private waitForDiscovery(discoveryWindowMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.cancelDiscovery = undefined
        resolve()
      }, discoveryWindowMs)
      this.cancelDiscovery = () => {
        clearTimeout(timer)
        this.cancelDiscovery = undefined
        resolve()
      }
    })
  }

  private suspendOwnership(): void {
    this.closeBroadcastChannel()
    this.broadcastResolved = false
  }

  private async reclaimOwnership(): Promise<void> {
    const previousId = this.sessionId
    if (!previousId || this.destroyed) return
    if (this.releaseLock) return

    const claimedId = await this.claimIdentity(previousId, true)
    if (this.destroyed) return
    this.sessionId = claimedId
    this.writeStoredId(claimedId)
    if (previousId !== claimedId) this.options.onIdChange?.(claimedId)
  }

  private handleBroadcastCollision(): void {
    if (!this.broadcastResolved) {
      this.broadcastContested = true
      return
    }
    void this.claimReplacementBroadcastId()
  }

  private async claimReplacementBroadcastId(): Promise<void> {
    if (this.lateClaimInProgress || this.destroyed || !this.broadcastChannel) return
    this.lateClaimInProgress = true
    this.broadcastResolved = false
    let candidate = this.createId()
    const discoveryWindowMs = this.options.discoveryWindowMs ?? DISCOVERY_WINDOW_MS

    try {
      while (!this.destroyed) {
        this.broadcastCandidate = candidate
        this.contenderNonce = this.createId()
        this.broadcastContested = false
        this.writeStoredId(candidate)
        this.broadcastChannel.postMessage({
          type: 'claim',
          sessionId: candidate,
          nonce: this.contenderNonce
        } satisfies SessionMessage)
        await this.waitForDiscovery(discoveryWindowMs)

        if (this.destroyed) return
        if (!this.broadcastContested) {
          const previousId = this.sessionId
          this.sessionId = candidate
          this.broadcastResolved = true
          if (previousId !== candidate) this.options.onIdChange?.(candidate)
          return
        }

        candidate = this.createId()
      }
    } finally {
      this.lateClaimInProgress = false
    }
  }

  private closeBroadcastChannel(): void {
    if (!this.broadcastChannel) return
    this.broadcastChannel.onmessage = null
    this.broadcastChannel.close()
    this.broadcastChannel = undefined
  }

  private createId(): string {
    const bytes = new Uint8Array(16)
    const fillRandomValues = this.options.fillRandomValues ?? ((values) => crypto.getRandomValues(values))
    fillRandomValues(bytes)
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  }
}
