require('dotenv').config()
const fs = require('fs')
const path = require('path')

const config = {
  github: {
    token: process.env.GITHUB_TOKEN,
    pollInterval: 10 * 1000
  },
  pagespeed: {
    apiKey: process.env.PAGESPEED_API_KEY
  },
  proxy: {
    port: process.env.PROXY_PORT || 8088
  }
}

if (!config.github.token) {
  throw new Error('GITHUB_TOKEN environment variable is required')
}

if (!config.pagespeed.apiKey) {
  throw new Error('PAGESPEED_API_KEY environment variable is required')
}

const CONFIG_FILE = path.join(__dirname, '..', '.ciborg-config.json')

function loadConfig () {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    }
  } catch (error) {
    console.error('Error loading config:', error)
  }
  return { owner: '', repo: '', gitHost: '' }
}

function saveConfig (newConfig) {
  try {
    let currentConfig = {}
    if (fs.existsSync(CONFIG_FILE)) {
      currentConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    }
    const mergedConfig = { ...currentConfig, ...newConfig }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(mergedConfig, null, 2))
  } catch (error) {
    console.error('Error saving config:', error)
  }
}

module.exports = {
  config,
  loadConfig,
  saveConfig
}
