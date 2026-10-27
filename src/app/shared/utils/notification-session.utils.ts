const sessionIds = new WeakMap<Document, string>()

/**
 * Returns the notification session ID for one loaded page document.
 *
 * Socket reconnects, client-side navigation and connector recreation reuse it.
 * Reloads and new or duplicated tabs create a new document and a new identity.
 * Restoring the same document from BFCache keeps its identity. No browser storage
 * or cross-tab coordination is used; catch-up does not continue across reloads.
 */
export function getNotificationSessionId(pageDocument: Document = globalThis.document): string {
  let sessionId = sessionIds.get(pageDocument)
  if (!sessionId) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    sessionId = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
    sessionIds.set(pageDocument, sessionId)
  }
  return sessionId
}
