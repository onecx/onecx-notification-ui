# onecx-notification-ui

OneCX Notification UI

## Notification session identity

The notification connector uses one random session ID per loaded browser document (the current page runtime). Socket reconnects, Angular route changes, and destroying or recreating a connector in that document reuse the same ID. Concurrent connectors in the same document also share it.

A full reload, full-page navigation, or newly opened or duplicated tab creates a new document and a new ID. Restoring the same document from the browser's back-forward cache retains its ID; if the browser reloads it instead, it gets a new one. The ID is held only in memory. No session storage, Web Locks, BroadcastChannel ownership checks, or identity rotation are needed.

A reload intentionally starts a new notification session rather than resuming the previous document's per-session catch-up. Catch-up continuity is limited to reconnects of the same document. New-session delivery follows the BFF's new-session policy; a fresh ID does not recover the old session's missed events.

Each registration adds the opaque `sessionId` field to the existing frame: `{ type: 'register', address, token, sessionId }`. The address and token are unchanged, and received notifications continue to be published unchanged on `NotificationTopic`.
