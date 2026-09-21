describe('SockJsRxClient', () => {
  let SockJSMock: jest.Mock
  let sockets: any[]
  let SockJsRxClient: any

  beforeEach(() => {
    jest.resetModules()
    sockets = []
    SockJSMock = jest.fn().mockImplementation((url: string) => {
      const socket: any = {
        url,
        readyState: 0,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      }
      sockets.push(socket)
      return socket
    })

    jest.doMock('sockjs-client', () => ({ default: SockJSMock }))
    SockJsRxClient = require('./sockjs.utils').SockJsRxClient
  })

  it('flushes queued messages on open and calls onOpen, emits messages via deserializer', (done) => {
    const onOpenMock = jest.fn()
    const client = new SockJsRxClient({ onOpen: onOpenMock })

    client.send({ a: 1 })

    const received: any[] = []
    const sub = client.connect('http://x').subscribe({
      next: (v: any) => received.push(v),
      error: (err: any) => done(err)
    })

    const sock = sockets[0]
    sock.onopen()

    expect(onOpenMock).toHaveBeenCalled()
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ a: 1 }))

    sock.onmessage({ data: JSON.stringify({ hello: 'world' }) } as any)

    expect(received).toEqual([{ hello: 'world' }])
    Promise.resolve().then(() => {
      sub.unsubscribe()
      done()
    })
  })

  it('calls onError and errors observable on socket.onerror', (done) => {
    const onErrorMock = jest.fn()
    const client = new SockJsRxClient({ onError: onErrorMock })

    const sub = client.connect('e').subscribe({
      next: () => done(new Error('should not emit next')),
      error: () => {
        expect(onErrorMock).toHaveBeenCalled()
        sub.unsubscribe()
        done()
      }
    })

    const sock = sockets[0]
    sock.onerror(new Event('err'))
  })

  it('errors subscriber when deserializer throws', (done) => {
    const client = new SockJsRxClient({
      deserializer: () => {
        throw new Error('bad parse')
      }
    })

    const sub = client.connect('d').subscribe({
      next: () => done(new Error('should not emit next')),
      error: (err: any) => {
        expect(err).toBeInstanceOf(Error)
        expect(err.message).toBe('bad parse')
        sub.unsubscribe()
        done()
      }
    })

    const sock = sockets[0]
    sock.onopen()
    sock.onmessage({ data: 'irrelevant' } as any)
  })

  it('calls onClose and errors observable on socket.onclose', (done) => {
    const onCloseMock = jest.fn()
    const client = new SockJsRxClient({ onClose: onCloseMock })

    const sub = client.connect('c').subscribe({
      next: () => done(new Error('should not emit next')),
      error: () => {
        expect(onCloseMock).toHaveBeenCalled()
        sub.unsubscribe()
        done()
      }
    })

    const sock = sockets[0]
    sock.onclose(new CloseEvent('close'))
  })

  it('send sends immediately when socket readyState is OPEN, otherwise queues', () => {
    const client = new SockJsRxClient()
    const sub = client.connect('s').subscribe(() => undefined)
    const sock = sockets[0]

    sock.readyState = 1
    client.send({ now: true })
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ now: true }))

    const client2 = new SockJsRxClient()
    const sub2 = client2.connect('s2').subscribe(() => undefined)
    const sock2 = sockets[1]

    sock2.readyState = 0
    client2.send({ queued: 1 })
    sock2.onopen()
    expect(sock2.send).toHaveBeenCalledWith(JSON.stringify({ queued: 1 }))

    sub.unsubscribe()
    sub2.unsubscribe()
  })

  it('close closes socket and clears internal socket reference', () => {
    const client = new SockJsRxClient()
    const sub = client.connect('x').subscribe(() => undefined)
    const sock = sockets[0]
    sock.readyState = 1

    client.close()
    expect(sock.close).toHaveBeenCalled()
    // private field socket should be undefined after close
    expect((client as any).socket).toBeUndefined()
    sub.unsubscribe()
  })
})
