const axios = require('axios')
const { config } = require('../config')

async function runPageSpeedTest (url) {
  try {
    const apiUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
    const params = {
      url,
      key: config.pagespeed.apiKey,
      strategy: 'mobile',
      category: ['performance', 'accessibility', 'best-practices', 'seo']
    }

    const response = await axios.get(apiUrl, { params })
    return response.data
  } catch (error) {
    console.error('Error running PageSpeed test:', error.message)
    throw error
  }
}

function extractMetrics (results) {
  if (!results || !results.lighthouseResult) {
    throw new Error('Invalid PageSpeed results: missing lighthouseResult')
  }

  const { lighthouseResult } = results
  const { categories, audits } = lighthouseResult

  if (!categories || !audits) {
    throw new Error('Invalid PageSpeed results: missing categories or audits')
  }

  const getNumericValue = (audit) => {
    if (!audit || typeof audit.numericValue !== 'number') return 0
    return Number((audit.numericValue / 1000).toFixed(2))
  }

  const getScore = (category) => {
    if (!category || typeof category.score !== 'number') return 0
    return Number((category.score * 100).toFixed(2))
  }

  const performanceScore = getScore(categories.performance)

  return {
    score: performanceScore,
    firstContentfulPaint: getNumericValue(audits['first-contentful-paint']),
    largestContentfulPaint: getNumericValue(audits['largest-contentful-paint']),
    totalBlockingTime: getNumericValue(audits['total-blocking-time']),
    cumulativeLayoutShift: Number(audits['cumulative-layout-shift'].numericValue.toFixed(2))
  }
}

module.exports = {
  runPageSpeedTest,
  extractMetrics
}
