require('dotenv').config()
const http = require('http')
const net = require('net')
const fs = require('fs')
const path = require('path')
const { config } = require('./config')
const chalk = require('chalk')

const ALLOWED_HOSTS = config.allowedHosts || []
const ALLOWED_URLS = []

const LOG_FILE = path.join(__dirname, '..', 'logs', 'external-requests.log')
fs.writeFileSync(LOG_FILE, '')
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' })

const handleHttpRequest = (req, res) => {
  const [host] = (req.headers.host || '').split(':')
  const url = req.url
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('OK')
    return
  }
  if (!isAllowed(host, url)) {
    const requestDetails = {
      url,
      host,
      method: req.method,
      headers: req.headers,
      path: req.url.split('?')[0],
      query: req.url.includes('?') ? '?' + req.url.split('?')[1] : ''
    }
    console.log(chalk.blue('Request details:', JSON.stringify(requestDetails, null, 2)))
    log('blocked', { ...requestDetails, protocol, originalUrl: req.originalUrl || req.url })
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Blocked by proxy')
    return
  }
  const proxyReq = http.request({
    host,
    port: req.headers.host?.split(':')[1] || 80,
    method: req.method,
    path: req.url,
    headers: req.headers
  }, function (proxyRes) {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })
  proxyReq.on('error', function (err) {
    log('proxy_error', { error: err.message, url: req.url })
    res.writeHead(502).end('Proxy error: ' + err.message)
  })
  req.pipe(proxyReq)
}

const handleConnect = (req, clientSocket, head) => {
  const [host, port] = req.url.split(':')
  const connectLog = {
    method: 'CONNECT',
    url: req.url,
    protocol: 'HTTPS',
    timestamp: new Date().toISOString()
  }
  if (!isAllowed(host)) {
    log('blocked', connectLog)
    clientSocket.end()
    return
  }
  const serverSocket = net.connect(port || 443, host, function () {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-agent: Node-Proxy\r\nConnection: keep-alive\r\n\r\n')
    if (head?.length) serverSocket.write(head)
    handleData(clientSocket, serverSocket, 'Client->Server')
    handleData(serverSocket, clientSocket, 'Server->Client')
    handleClose(clientSocket, 'client')
    handleClose(serverSocket, 'server')
  })
  serverSocket.on('error', function (err) {
    handleError(clientSocket, err, 'Server')
  })
  clientSocket.on('error', function (err) {
    handleError(serverSocket, err, 'Client')
  })
}

const handleData = (source, target, context) => {
  source.on('data', function (chunk) {
    try {
      target.write(chunk)
    } catch (err) {
      handleError(target, err, context)
    }
  })
}

const handleClose = (socket, context) => {
  socket.on('close', function () {
    log('closed', {
      method: 'CONNECT',
      url: socket.url,
      protocol: 'HTTPS',
      timestamp: new Date().toISOString(),
      status: 'closed',
      reason: `${context}_closed`
    })
    socket.end()
  })
}

const handleError = (socket, err, context) => {
  console.error(`[${context}] Error:`, err.message)
  log('error', { status: 'error', error: `${context} error: ${err.message}` })
  socket.end()
}

const isAllowed = (host, url) => {
  if (ALLOWED_HOSTS.includes(host)) return true
  if (ALLOWED_URLS.includes(url)) return true
  return false
}

const log = (type, data) => {
  const logEntry = {
    blocked: () => {
      const fullUrl = data.method === 'CONNECT'
        ? `https://${data.url.split(':')[0]}`
        : `${data.protocol || 'http'}://${data.headers?.host || data.host}${data.url}`
      return `blocked: ${data.method || 'CONNECT'} ${fullUrl}\n`
    },
    error: () => `error: ${data.error}\n`,
    closed: () => `closed: ${data.method} ${data.url}\n`
  }
  logStream.write(logEntry[type]())
}

const server = http.createServer(handleHttpRequest)
server.on('connect', handleConnect)

process.on('SIGINT', function () {
  logStream.end()
  process.exit()
})

const PORT = config.proxy.port
server.listen(PORT, () => {
  console.log(chalk.green(`Proxy server running on port ${PORT}`))
})
