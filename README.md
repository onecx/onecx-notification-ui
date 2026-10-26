# onecx-notification-ui

OneCX Notification UI

## Notification session identity

The notification connector assigns each browser tab a random session ID and stores it in tab-scoped `sessionStorage`, so page reloads and socket reconnects reuse the same identity. A newly opened tab gets a new ID. If a duplicated tab inherits the original tab's storage, Web Locks or `BroadcastChannel` ownership checks detect the live owner and assign the duplicate a different ID. The connector releases its ownership when it is destroyed without deleting the stored value.

If session storage is unavailable, the connector continues with an in-memory identity. If neither Web Locks nor `BroadcastChannel` is available, it uses a fresh ID for that page runtime. In either fallback, notification registration still works.

Each registration adds the opaque `sessionId` field to the existing frame: `{ type: 'register', address, token, sessionId }`. The address and token are unchanged, and received notifications continue to be published unchanged on `NotificationTopic`.
