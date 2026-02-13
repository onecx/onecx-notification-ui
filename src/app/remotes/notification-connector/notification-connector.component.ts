import { CommonModule } from '@angular/common'
import { Component, Input, OnDestroy, inject } from '@angular/core'
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy'
import { Observable, timer, from } from 'rxjs'
import { webSocket, WebSocketSubject } from 'rxjs/webSocket'
import { retry, mergeMap } from 'rxjs/operators'
import { Topic } from '@onecx/accelerator'
import { AuthProxyService } from '@onecx/angular-auth'

import {
  AngularRemoteComponentsModule,
  RemoteComponentConfig,
  ocxRemoteComponent,
  ocxRemoteWebcomponent
} from '@onecx/angular-remote-components'

interface InitConnectionMessage {
  type: 'init',
  authHeaders: Record<string, string>
}

export interface Notification {
  type: 'notification'
  id: string
  productName: string
  appId: string
  sendAt: string
}

export class NotificationTopic extends Topic<Notification> {
  constructor() {
    super('notification', 1, false)
  }
}

@Component({
  selector: 'app-notification-connector',
  standalone: true,
  template: '',
  imports: [AngularRemoteComponentsModule, CommonModule],
  providers: []
})
@UntilDestroy()
export class OneCXNotificationConnectorComponent implements OnDestroy, ocxRemoteComponent, ocxRemoteWebcomponent {
  private websocket$: WebSocketSubject<Notification | InitConnectionMessage> | undefined
  private readonly reconnectDelay = 5000
  private _notificationTopic?: NotificationTopic
  private get notificationTopic(): NotificationTopic {
    this._notificationTopic ??= new NotificationTopic()
    return this._notificationTopic
  }
  private readonly authService = inject(AuthProxyService)


  @Input() set ocxRemoteComponentConfig(config: RemoteComponentConfig) {
    this.ocxInitRemoteComponent(config)
  }

  ocxInitRemoteComponent(remoteComponentConfig: RemoteComponentConfig) {
    const wsUrl = remoteComponentConfig.baseUrl.replace(/^http/, 'ws') + '/bff/socket'
    this.connectWebSocket(wsUrl)
  }

  private connectWebSocket(url: string): void {
    const createWebSocket = (): Observable<Notification | InitConnectionMessage> => {
      return from(this.authService.updateTokenIfNeeded()).pipe(
        mergeMap(() => {
          const headerValues = this.authService.getHeaderValues()
          const token = headerValues['Authorization']?.replace('Bearer ', '')
          const wsUrlWithAuth = token ? `${url}?token=${encodeURIComponent(token)}` : url

          this.websocket$ = webSocket<Notification | InitConnectionMessage>({
            url: wsUrlWithAuth,
            openObserver: {
              next: () => {
                console.log('WebSocket connection established')
              }
            },
            closeObserver: {
              next: () => {
                console.log('WebSocket connection closed')
              }
            }
          })
          this.websocket$.next({ type: 'init', authHeaders: headerValues });
          return this.websocket$
        })
      )
    }

    createWebSocket()
      .pipe(
        retry({
          delay: (error) => {
            console.error('WebSocket error, reconnecting in ' + this.reconnectDelay + 'ms...', error)
            return timer(this.reconnectDelay)
          }
        }),
        untilDestroyed(this)
      )
      .subscribe((notification: Notification | InitConnectionMessage) => {
        console.log('Received notification:', notification)
        if (notification.type === 'notification') {
          this.notificationTopic.publish(notification)
        }
      })
  }

  ngOnDestroy(): void {
    this._notificationTopic?.destroy()
  }
}
