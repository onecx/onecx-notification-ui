import { CommonModule } from '@angular/common'
import { Component, Input, OnDestroy, inject } from '@angular/core'
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy'
import { Observable, defer, from, timer } from 'rxjs'
import { retry, switchMap } from 'rxjs/operators'
import { Topic } from '@onecx/accelerator'
import { AuthProxyService } from '@onecx/angular-auth'

import {
  AngularRemoteComponentsModule,
  RemoteComponentConfig,
  ocxRemoteComponent,
  ocxRemoteWebcomponent
} from '@onecx/angular-remote-components'
import { SockJsRxClient } from '../../shared/utils/sockjs.utils'
import { UserService } from '@onecx/angular-integration-interface'

interface RegisterMessage {
  type: 'register',
  address: string,
  authHeaders: Record<string, string>
}

export interface RawNotification {
  type: 'rec'
  address: string;
  headers: { [key: string]: string }
  body: string;
}

export interface Notification {
  type: string,
  address: string,
  headers: { [key: string]: string }
  body: {
    id: string,
    applicationId: string,
    senderId: string,
    receiverId: string,
    persist: boolean,
    creationData: Date,
    contentMeta: [{
      key: string,
      value: string
    }]
  }
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
  private sockJsClient?: SockJsRxClient<RawNotification | RegisterMessage, RegisterMessage>
  private readonly reconnectDelay = 5000
  private _notificationTopic?: NotificationTopic
  private get notificationTopic(): NotificationTopic {
    this._notificationTopic ??= new NotificationTopic()
    return this._notificationTopic
  }
  private readonly authService = inject(AuthProxyService)
  private readonly userService = inject(UserService)


  @Input() set ocxRemoteComponentConfig(config: RemoteComponentConfig) {
    this.ocxInitRemoteComponent(config)
  }

  ocxInitRemoteComponent(remoteComponentConfig: RemoteComponentConfig) {
    const wsUrl = remoteComponentConfig.baseUrl + '/bff/eventbus'
    this.connectWebSocket(wsUrl)
  }

  private connectWebSocket(url: string): void {
    defer(() => this.createSocketConnection(url))
      .pipe(
        retry({
          delay: (error) => {
            console.error('WebSocket error, reconnecting in ' + this.reconnectDelay + 'ms...', error)
            return timer(this.reconnectDelay)
          }
        }),
        untilDestroyed(this)
      )
      .subscribe((notification) => this.handleIncomingNotification(notification))
  }

  private createSocketConnection(url: string): Observable<RawNotification | RegisterMessage> {
    return from(this.authService.updateTokenIfNeeded()).pipe(
      switchMap(() => this.userService.profile$.asObservable()),
      switchMap((profile) => {
        const headerValues = this.authService.getHeaderValues()
        const wsUrlWithAuth = this.buildWsUrl(url, headerValues)

        const client = this.recreateSockJsClient(profile.userId, headerValues)

        return client.connect(wsUrlWithAuth)
      })
    )
  }

  private buildWsUrl(url: string, headerValues: Record<string, string>): string {
    // const token = headerValues['Authorization']?.replace('Bearer ', '')
    const token = null
    return token ? `${url}?token=${encodeURIComponent(token)}` : url
  }

  private recreateSockJsClient(userId: string, authHeaders: Record<string, string>): SockJsRxClient<RawNotification | RegisterMessage, RegisterMessage> {
    this.sockJsClient?.close()
    this.sockJsClient = new SockJsRxClient<RawNotification | RegisterMessage, RegisterMessage>({
      onOpen: () => {
        console.log('WebSocket connection established, connecting with user id:', userId)
        this.sockJsClient?.send({ type: 'register', address: `notifications.onecx.new.${userId}`, authHeaders })
      },
      onClose: () => {
        console.log('WebSocket connection closed')
      }
    })

    return this.sockJsClient
  }

  private handleIncomingNotification(notification: RawNotification | RegisterMessage): void {
    if (notification.type !== 'rec') {
      return
    }

    const body = JSON.parse(notification.body)
    const parsedNotification: Notification = {
      ...notification,
      body
    }
    
    console.log('Received notification(rec):', parsedNotification)
    this.notificationTopic.publish(parsedNotification)
  }

  ngOnDestroy(): void {
    this.sockJsClient?.close()
    this._notificationTopic?.destroy()
  }
}
