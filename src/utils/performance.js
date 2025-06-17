const { runPageSpeedTest, extractMetrics } = require('./pagespeed')
const chalk = require('chalk')
const { formatTable } = require('./metrics')
const sleep = require('./sleep')

module.exports = {
  handlePerf
}

async function runTestsForUrl (url, numRuns) {
  const results = []
  for (let i = 0; i < numRuns; i++) {
    console.log(chalk.yellow(`Run ${i + 1}/${numRuns} for ${url}...`))
    const pageSpeedResults = await runPageSpeedTest(url)
    const metrics = extractMetrics(pageSpeedResults)
    results.push(metrics)

    if (i < numRuns - 1) {
      console.log(chalk.blue(`Waiting 3 minutes before next test for ${url}...`))
      await sleep(3 * 60 * 1000)
    }
  }
  return results
}

async function handlePerf (urls, numRuns = 5) {
  try {
    console.log(chalk.blue(`\nRunning PageSpeed tests concurrently for ${urls.length} URLs...`))
    // Run tests for all URLs concurrently
    const testPromises = urls.map(url => {
      console.log(chalk.yellow(`Starting tests for: ${url}`))
      return runTestsForUrl(url, numRuns)
    })

    // Wait for all tests to complete
    const resultsArray = await Promise.all(testPromises)
    // Combine results with their respective URLs
    const allResults = {}
    urls.forEach((url, index) => {
      allResults[url] = resultsArray[index]
    })

    // Format results for each URL
    const formattedResults = {}
    for (const [url, results] of Object.entries(allResults)) {
      formattedResults[url] = formatTable(results)
    }

    return formattedResults
  } catch (error) {
    console.error('Error running PageSpeed test:', error)
    throw error
  }
}
