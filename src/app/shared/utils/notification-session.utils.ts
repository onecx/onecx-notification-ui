let sessionId: string | undefined

/**
 * Returns the notification session ID for the tab's running app.
 *
 * Socket reconnects, client-side navigation and connector recreation reuse it.
 * Reloads and new or duplicated tabs start a fresh runtime and a new identity.
 * Restoring the running app from BFCache keeps its identity. No browser storage
 * or cross-tab coordination is used; catch-up does not continue across reloads.
 */
export function getNotificationSessionId(): string {
  if (!sessionId) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    sessionId = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  }
  return sessionId
}
