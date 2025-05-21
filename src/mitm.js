// filepath: /home/somoy/work/ciborg/src/mitm.js
// MITM proxy that blocks all requests and logs status, method, and url to logs/mitm.log
const { Proxy } = require('http-mitm-proxy')
const fs = require('fs')
const path = require('path')
const { loadConfig, config } = require('./config')

const configData = loadConfig()

const LOG_FILE = path.join(__dirname, '..', 'logs', 'mitm.log')
fs.writeFileSync(LOG_FILE, '')
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' })

function isAllowedHost (host, url) {
  if (url === '/health') return true
  if (!Array.isArray(configData.allowedHosts)) return false
  const baseHost = host.split(':')[0]
  return configData.allowedHosts.some(allowed => {
    if (baseHost === allowed) return true
    return baseHost.endsWith('.' + allowed)
  })
}

const proxy = new Proxy({
  sslCaDir: path.join(__dirname, '..', '.http-mitm-proxy', 'certs'),
  sslCaKey: path.join(__dirname, '..', '.http-mitm-proxy', 'keys', 'ca.private.key'),
  sslCaCert: path.join(__dirname, '..', '.http-mitm-proxy', 'certs', 'ca.pem'),
  ssl: {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    rejectUnauthorized: false
  }
})

proxy.onError((ctx, err) => {
  const timestamp = new Date().toISOString()
  logStream.write(`[${timestamp}] ERROR: ${err.message}\n`)
  ctx.proxyToClientResponse.writeHead(500, { 'Content-Type': 'text/plain' })
  ctx.proxyToClientResponse.end('Internal Server Error')
})

proxy.onRequest((ctx, callback) => {
  const fullHost = ctx.clientToProxyRequest.headers.host
  const host = fullHost ? fullHost.split(':')[0] : ''
  const url = ctx.clientToProxyRequest.url
  const timestamp = new Date().toISOString()
  if (url === '/health') {
    logStream.write(`[${timestamp}] ALLOWED: ${ctx.clientToProxyRequest.method} ${ctx.clientToProxyRequest.url}\n`)
    ctx.proxyToClientResponse.writeHead(200, { 'Content-Type': 'text/plain' })
    ctx.proxyToClientResponse.end('OK')
    return
  }
  if (!isAllowedHost(host, url)) {
    logStream.write(`[${timestamp}] BLOCKED: ${ctx.clientToProxyRequest.method} ${fullHost || ''}${ctx.clientToProxyRequest.url}\n`)
    ctx.proxyToClientResponse.writeHead(403, { 'Content-Type': 'text/plain' })
    ctx.proxyToClientResponse.end('Access Denied: Host not allowed')
    return
  }
  logStream.write(`[${timestamp}] ALLOWED: ${ctx.clientToProxyRequest.method} ${fullHost || ''}${ctx.clientToProxyRequest.url}\n`)
  return callback()
})

proxy.onResponse((ctx, callback) => {
  return callback()
})

proxy.onConnect((req, socket, head, callback) => {
  const host = req.url.split(':')[0]
  const url = req.url
  const timestamp = new Date().toISOString()
  if (!isAllowedHost(host, url)) {
    logStream.write(`[${timestamp}] BLOCKED: CONNECT ${req.url}\n`)
    socket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nBlocked by MITM proxy')
    socket.destroy()
    return
  }
  logStream.write(`[${timestamp}] ALLOWED: CONNECT ${req.url}\n`)
  callback()
})

const PORT = config.proxy.port || 8088
proxy.listen({ port: PORT, host: '127.0.0.1' }, () => {
  console.log(`MITM proxy listening on 127.0.0.1:${PORT}`)
})

process.on('SIGINT', function () {
  logStream.end()
  process.exit()
})
