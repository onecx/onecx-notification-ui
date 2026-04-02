/**
 * Used in local environment:
 *   Request proxy to rewrite URLs and prevent CORS errors
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logFn = function (_req, _res) {
  //console.log(new Date().toISOString() + `: bypassing ${_req.method} ${_req.url} `)
}
const onProxyRes = function (_proxyRes, req, res) {
  logFn(req, res)
  if (req.method.toUpperCase() === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, HEAD, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    return res.send('')
  }
}

const PROXY_CONFIG = {
  '/bff': {
    target: 'http://notification-bff',
    secure: false,
    pathRewrite: { '^.*/bff': '' },
    changeOrigin: true,
    logLevel: 'debug',
    onProxyRes: onProxyRes
  },
  '/mfe/notification': {
    target: 'http://localhost:4200',
    secure: false,
    pathRewrite: { '^.*/mfe/notification': '' },
    changeOrigin: true,
    logLevel: 'debug',
    onProxyRes: onProxyRes
  }
}

module.exports = PROXY_CONFIG
