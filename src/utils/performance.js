const { runPageSpeedTest, extractMetrics } = require('./pagespeed')
const chalk = require('chalk')
const { formatTable } = require('./metrics')
const sleep = require('./sleep')

module.exports = {
  handlePerf
}

async function handlePerf (finalPreviewUrl, numRuns = 5) {
  try {
    const results = []
    for (let i = 0; i < numRuns; i++) {
      console.log(chalk.yellow(`Running PageSpeed test ${i + 1}/${numRuns}...`))
      const pageSpeedResults = await runPageSpeedTest(finalPreviewUrl)
      const metrics = extractMetrics(pageSpeedResults)
      results.push(metrics)

      if (i < numRuns - 1) {
        console.log(chalk.blue('Waiting 3 minutes before next test...'))
        await sleep(3 * 60 * 1000)
      }
    }

    return formatTable(results)
  } catch (error) {
    console.error('Error running PageSpeed test:', error)
  }
}
