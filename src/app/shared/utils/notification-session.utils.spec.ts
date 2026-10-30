import { getNotificationSessionId } from './notification-session.utils'

describe('getNotificationSessionId', () => {
  it('should return an opaque random ID when the tab first registers', () => {
    expect(getNotificationSessionId()).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should reuse the ID when the same running app registers again', () => {
    const sessionId = getNotificationSessionId()

    expect(getNotificationSessionId()).toBe(sessionId)
  })

  it('should generate a different ID when a fresh app runtime starts', async () => {
    const originalId = getNotificationSessionId()
    let freshId: string | undefined

    await jest.isolateModulesAsync(async () => {
      const freshSession = await import('./notification-session.utils')
      freshId = freshSession.getNotificationSessionId()
    })

    expect(freshId).toMatch(/^[a-f0-9]{32}$/)
    expect(freshId).not.toBe(originalId)
    expect(getNotificationSessionId()).toBe(originalId)
  })
})
