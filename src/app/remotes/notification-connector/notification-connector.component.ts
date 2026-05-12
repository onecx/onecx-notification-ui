import { CommonModule } from '@angular/common'
import { Component, Input, OnDestroy, inject } from '@angular/core'
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy'
import { Topic } from '@onecx/accelerator'
import { AuthProxyService } from '@onecx/angular-auth'
import { Observable, defer, from, timer } from 'rxjs'
import { retry, switchMap } from 'rxjs/operators'

import { UserService } from '@onecx/angular-integration-interface'
import {
  AngularRemoteComponentsModule,
  RemoteComponentConfig,
  ocxRemoteComponent,
  ocxRemoteWebcomponent
} from '@onecx/angular-remote-components'
import { createLogger } from 'src/app/shared/utils/logger.utils'
import { SockJsRxClient } from '../../shared/utils/sockjs.utils'

interface RegisterMessage {
  type: 'register',
  address: string,
  token: string
}

export interface RawNotification {
  type: 'rec'
  address: string;
  headers: { [key: string]: string }
  body: string;
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
  private readonly logger = createLogger("NotificationConnectorComponent")


  @Input() set ocxRemoteComponentConfig(config: RemoteComponentConfig) {
    this.ocxInitRemoteComponent(config)
  }

  ocxInitRemoteComponent(remoteComponentConfig: RemoteComponentConfig) {
    const wsUrl = remoteComponentConfig.baseUrl + 'bff/eventbus'
    this.connectWebSocket(wsUrl)
  }

  private connectWebSocket(url: string): void {
    defer(() => this.createSocketConnection(url))
      .pipe(
        retry({
          delay: (error) => {
            this.logger.error('WebSocket error, reconnecting in ' + this.reconnectDelay + 'ms...', error)
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
        const token = this.extractBearerToken(headerValues)
        const client = this.recreateSockJsClient(profile.userId, token)

        return client.connect(url)
      })
    )
  }

  private extractBearerToken(headerValues: Record<string, string>): string {
    const authorization = headerValues['Authorization']
    if (!authorization) {
      this.logger.warn('Authorization header missing when registering WebSocket connection')
      return ''
    }

    return authorization.replace(/^Bearer\s+/i, '')
  }

  private recreateSockJsClient(userId: string, token: string): SockJsRxClient<RawNotification | RegisterMessage, RegisterMessage> {
    this.sockJsClient?.close()
    this.sockJsClient = new SockJsRxClient<RawNotification | RegisterMessage, RegisterMessage>({
      onOpen: () => {
        this.logger.info('WebSocket connection established, connecting with user id:', userId)
        this.sockJsClient?.send({ type: 'register', address: `notifications.onecx.new.${userId}`, token })
      },
      onClose: () => {
        this.logger.info('WebSocket connection closed')
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
    
    this.logger.info('Received notification(rec):', parsedNotification)
    this.notificationTopic.publish(parsedNotification)
  }

  ngOnDestroy(): void {
    this.sockJsClient?.close()
    this._notificationTopic?.destroy()
  }
}
