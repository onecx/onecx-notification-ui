# onecx-notification-ui

OneCX Notification UI

## Notification session identity

The notification connector assigns each browser tab a random session ID and stores it in tab-scoped `sessionStorage`, so page reloads and socket reconnects reuse the same identity. A newly opened tab gets a new ID. If a duplicated tab inherits the original tab's storage, Web Locks or `BroadcastChannel` ownership checks detect the live owner and assign the duplicate a different ID. Delayed `BroadcastChannel` owner replies also cause the duplicate to switch IDs and re-register. Ownership is suspended while a page is in the back-forward cache and reclaimed when it is restored, so an original tab may receive a new ID and re-register if a duplicate claimed its stored identity during that interval. Ownership is released when the connector is destroyed without deleting the stored value.

If session storage is unavailable, the connector continues with an in-memory identity. If coordination APIs are unavailable while session storage works, the stored ID is still reused across reloads, but duplicate-tab detection cannot be guaranteed. Notification registration continues in either fallback.

Each registration adds the opaque `sessionId` field to the existing frame: `{ type: 'register', address, token, sessionId }`. The address and token are unchanged, and received notifications continue to be published unchanged on `NotificationTopic`.
