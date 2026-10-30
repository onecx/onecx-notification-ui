import { getNotificationSessionId } from './notification-session.utils'

describe('getNotificationSessionId', () => {
  it('should return an opaque random ID when the tab first registers', () => {
    expect(getNotificationSessionId()).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should reuse the ID when the same running app registers again', () => {
    const sessionId = getNotificationSessionId()

    expect(getNotificationSessionId()).toBe(sessionId)
  })

  it.each(['a reload', 'a new tab', 'a duplicated tab'])(
    'should generate a different ID when %s starts a fresh app runtime',
    async () => {
      const originalId = getNotificationSessionId()
      let freshId: string | undefined

      await jest.isolateModulesAsync(async () => {
        const freshSession = await import('./notification-session.utils')
        freshId = freshSession.getNotificationSessionId()
      })

      expect(freshId).toMatch(/^[a-f0-9]{32}$/)
      expect(freshId).not.toBe(originalId)
      expect(getNotificationSessionId()).toBe(originalId)
    }
  )

  it('should keep the ID when the running app is restored from BFCache', () => {
    const sessionId = getNotificationSessionId()

    globalThis.window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    globalThis.window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(getNotificationSessionId()).toBe(sessionId)
  })
})
