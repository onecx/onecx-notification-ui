import { getNotificationSessionId } from './notification-session.utils'

describe('getNotificationSessionId', () => {
  it('should return an opaque random ID when a document first registers', () => {
    const pageDocument = document.implementation.createHTMLDocument()

    expect(getNotificationSessionId(pageDocument)).toMatch(/^[a-f0-9]{32}$/)
  })

  it('should reuse the ID when the same document registers again', () => {
    const pageDocument = document.implementation.createHTMLDocument()
    const sessionId = getNotificationSessionId(pageDocument)

    expect(getNotificationSessionId(pageDocument)).toBe(sessionId)
  })

  it('should generate a new ID when a reload creates a new document', () => {
    const initialDocument = document.implementation.createHTMLDocument()
    const reloadedDocument = document.implementation.createHTMLDocument()

    expect(getNotificationSessionId(reloadedDocument)).not.toBe(getNotificationSessionId(initialDocument))
  })

  it('should generate a different ID when a duplicated tab gets its own document', () => {
    const originalDocument = document.implementation.createHTMLDocument()
    const duplicateDocument = document.implementation.createHTMLDocument()
    const originalId = getNotificationSessionId(originalDocument)

    expect(getNotificationSessionId(duplicateDocument)).not.toBe(originalId)
    expect(getNotificationSessionId(originalDocument)).toBe(originalId)
  })

  it('should use the current document when no document is supplied', () => {
    expect(getNotificationSessionId()).toBe(getNotificationSessionId(document))
  })

  it('should keep the ID when the same document is restored from BFCache', () => {
    const sessionId = getNotificationSessionId()

    globalThis.window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    globalThis.window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(getNotificationSessionId()).toBe(sessionId)
  })
})
