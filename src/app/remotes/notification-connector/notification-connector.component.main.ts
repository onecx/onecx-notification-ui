;(globalThis as typeof globalThis & { global?: typeof globalThis }).global ??= globalThis
import('./notification-connector.component.bootstrap').catch((err) => console.error(err))
