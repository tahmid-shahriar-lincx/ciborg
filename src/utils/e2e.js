const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const chalk = require('chalk')
const { checkoutPRBranch } = require('./pr')

module.exports = {
  runE2ETests,
  getAvailableTests
}

async function getAvailableTests (tempDir) {
  const e2eDir = path.join(tempDir, 'cypress', 'e2e')
  if (!fs.existsSync(e2eDir)) {
    return []
  }

  const files = fs.readdirSync(e2eDir)
  return files
    .filter(file => file.endsWith('.cy.js') || file.endsWith('.spec.js'))
    .map(file => ({
      name: file.replace(/\.(cy|spec)\.js$/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: file
    }))
}

async function runE2ETests ({ octokit, owner, repo, pr, selectedTests = [], tempDir }) {
  console.log(chalk.blue(`Running E2E tests for PR #${pr.number} in ${owner}/${repo}`))

  if (!tempDir) {
    tempDir = await checkoutPRBranch({ octokit, owner, repo, pr })
    console.log(chalk.green(`Checked out PR #${pr.number} in ${tempDir}`))
  }

  const projectRoot = path.resolve(__dirname, '..', '..')

  await killPort(8088)
  await killPort(8099)
  console.log(chalk.yellow('Killed any existing processes on ports 8088 and 8099'))

  const proxyProcess = startProxyServer(projectRoot)
  const httpServerProcess = startHttpServer(tempDir)

  await new Promise(resolve => setTimeout(resolve, 5000))

  try {
    const httpResponse = await fetch('http://localhost:8099')
    if (!httpResponse.ok) {
      throw new Error('HTTP server not responding')
    }
    console.log(chalk.green('HTTP server is running'))
  } catch (err) {
    console.log(chalk.red('HTTP server failed to start:', err.message))
    throw err
  }

  try {
    const proxyResponse = await fetch('http://localhost:8088/health')
    if (!proxyResponse.ok) {
      throw new Error('Proxy server not responding')
    }
    console.log(chalk.green('Proxy server is running'))
  } catch (err) {
    console.log(chalk.red('Proxy server failed to start:', err.message))
    throw err
  }

  return new Promise((resolve, reject) => {
    const testProcess = startTestProcess(tempDir, selectedTests)
    const logStream = setupLogging(projectRoot)

    handleTestProcessEvents({
      testProcess,
      logStream,
      proxyProcess,
      httpServerProcess,
      resolve
    })
  })
}

function handleTestProcessEvents (options) {
  const { testProcess, logStream, proxyProcess, httpServerProcess, resolve } = options
  testProcess.stdout.on('data', (data) => {
    const str = data.toString()
    logStream.write(str)
  })

  testProcess.stderr.on('data', (data) => {
    const str = data.toString()
    logStream.write(str)
  })

  testProcess.on('close', (code) => {
    try {
      if (httpServerProcess && httpServerProcess.pid) {
        process.kill(-httpServerProcess.pid)
      }
    } catch (err) {
      console.log(chalk.red('Warning: Could not kill HTTP server process:', err.message))
    }

    try {
      if (proxyProcess && proxyProcess.pid) {
        process.kill(-proxyProcess.pid)
      }
    } catch (err) {
      console.log(chalk.red('Warning: Could not kill proxy process:', err.message))
    }

    const logPath = logStream.path
    const logContent = fs.readFileSync(logPath, 'utf8')
    const lines = logContent.split('\n')

    let tableStartIndex = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('Spec') && lines[i].includes('Tests')) {
        tableStartIndex = i
        break
      }
    }

    if (tableStartIndex === -1) {
      console.log(chalk.red('No markdown table found in the log'))
      return
    }

    const tableLines = lines.slice(tableStartIndex)
    resolve(tableLines.join('\n'))
  })
}

function startProxyServer (projectRoot) {
  const proxyPath = path.join(__dirname, '..', 'mitm.js')
  const logDir = ensureLogDirectory(projectRoot)
  const logStream = createLogStream(logDir, 'proxy-server.log')
  const proxyProcess = spawnProcess('node', [proxyPath], { cwd: projectRoot })
  proxyProcess.stdout.pipe(logStream)
  proxyProcess.stderr.pipe(logStream)
  return proxyProcess
}

function startHttpServer (tempDir) {
  const projectRoot = path.resolve(__dirname, '..', '..')
  const logDir = ensureLogDirectory(projectRoot)
  const logStream = createLogStream(logDir, 'http-server.log')
  const httpProcess = spawnProcess('npx', ['http-server', 'public', '-p', '8099'], { cwd: tempDir })
  httpProcess.stdout.pipe(logStream)
  httpProcess.stderr.pipe(logStream)
  return httpProcess
}

function startTestProcess (tempDir, selectedTests = []) {
  const env = Object.assign({}, process.env, {
    HTTP_PROXY: 'http://localhost:8088',
    HTTPS_PROXY: 'http://localhost:8088'
  })

  const args = ['run']
  if (selectedTests.length > 0) {
    const specPattern = selectedTests.map(test => `cypress/e2e/${test}`).join(',')
    args.push('--spec', specPattern)
  }

  console.log(chalk.yellow('Running Cypress with args:', args))
  return spawn('npx', ['cypress', ...args], {
    cwd: tempDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    env
  })
}

function setupLogging (projectRoot) {
  const logDir = ensureLogDirectory(projectRoot)
  const logStream = createLogStream(logDir, 'e2e-test.log', true)
  logStream.write('--- E2E Test Log Start ---\n')
  return logStream
}

function ensureLogDirectory (projectRoot) {
  const logDir = path.join(projectRoot, 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return logDir
}

function createLogStream (logDir, filename, overwrite = false) {
  const logPath = path.join(logDir, filename)
  return fs.createWriteStream(logPath, { flags: overwrite ? 'w' : 'a' })
}

function spawnProcess (command, args, options) {
  const process = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  })
  return process
}

async function killPort (port) {
  try {
    const { execSync } = require('child_process')
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`)
  } catch (err) {
    console.log(chalk.red('Warning: Could not kill port:', err.message))
  }
}
