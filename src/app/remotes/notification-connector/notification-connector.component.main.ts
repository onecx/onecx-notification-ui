/* eslint-disable prettier/prettier */
;(globalThis as typeof globalThis & { global?: typeof globalThis }).global ??= globalThis
// eslint-disable-next-line @typescript-eslint/prefer-top-level-await
import('./notification-connector.component.bootstrap').catch((err) => console.error(err))
