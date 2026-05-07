import { Observable } from 'rxjs'
import SockJS from 'sockjs-client'

const SOCKJS_CONNECTING_STATE = 0
const SOCKJS_OPEN_STATE = 1

export interface SockJsRxClientConfig<TIncoming, TOutgoing> {
	onOpen?: () => void
	onClose?: (event: CloseEvent) => void
	onError?: (event: Event) => void
	serializer?: (message: TOutgoing) => string
	deserializer?: (rawMessage: string) => TIncoming
}

export class SockJsRxClient<TIncoming, TOutgoing = TIncoming> {
	private socket?: WebSocket
	private queuedMessages: TOutgoing[] = []
	private readonly serializer: (message: TOutgoing) => string
	private readonly deserializer: (rawMessage: string) => TIncoming

	constructor(private readonly config: SockJsRxClientConfig<TIncoming, TOutgoing> = {}) {
		this.serializer = config.serializer ?? ((message: TOutgoing) => JSON.stringify(message))
		this.deserializer = config.deserializer ?? ((rawMessage: string) => JSON.parse(rawMessage) as TIncoming)
	}

	connect(url: string): Observable<TIncoming> {
		return new Observable<TIncoming>((subscriber) => {
			const socket = new SockJS(url)
			this.socket = socket

			socket.onopen = () => {
				this.flushQueuedMessages(socket)
				this.config.onOpen?.()
			}

			socket.onmessage = (event: MessageEvent) => {
				try {
					subscriber.next(this.deserializer(String(event.data)))
				} catch (error) {
					subscriber.error(error)
				}
			}

			socket.onerror = (event: Event) => {
				this.config.onError?.(event)
				subscriber.error(new Error('SockJS connection error'))
			}

			socket.onclose = (event: CloseEvent) => {
				this.config.onClose?.(event)
				if (!subscriber.closed) {
					subscriber.error(new Error('SockJS connection closed'))
				}
			}

			return () => {
				socket.onopen = null
				socket.onmessage = null
				socket.onerror = null
				socket.onclose = null
				if (socket.readyState === SOCKJS_CONNECTING_STATE || socket.readyState === SOCKJS_OPEN_STATE) {
					socket.close()
				}
				if (this.socket === socket) {
					this.socket = undefined
				}
			}
		})
	}

	send(message: TOutgoing): void {
		if (this.socket?.readyState === SOCKJS_OPEN_STATE) {
			this.socket.send(this.serializer(message))
			return
		}
		this.queuedMessages.push(message)
	}

	close(): void {
		if (this.socket?.readyState === SOCKJS_CONNECTING_STATE || this.socket?.readyState === SOCKJS_OPEN_STATE) {
			this.socket.close()
		}
		this.socket = undefined
	}

	private flushQueuedMessages(socket: WebSocket): void {
		for (const message of this.queuedMessages) {
			socket.send(this.serializer(message))
		}
		this.queuedMessages = []
	}
}
