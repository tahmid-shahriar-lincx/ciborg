module.exports = {
  isValueSafe,
  formatTable
}

function isValueSafe (metric, value) {
  const thresholds = {
    score: { min: 50, max: 100 },
    fcp: { min: 0, max: 3 },
    lcp: { min: 0, max: 4 },
    cls: { min: 0, max: 0.25 },
    tbt: { min: 0, max: 0.6 }
  }

  const threshold = thresholds[metric]
  return value >= threshold.min && value <= threshold.max
}

function formatTable (results) {
  const safeFixed = (val) => (typeof val === 'number' && !isNaN(val) ? val.toFixed(2) : 'N/A')

  const asciiTable = [
    '┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐',
    '│ Run #   │ Score   │ FCP     │ LCP     │ TBT     │ CLS     │',
    '├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤',
    ...results.map((r, i) => {
      const runNum = (i + 1).toString().padEnd(7)
      const score = safeFixed(r.score).padEnd(5)
      const fcp = safeFixed(r.firstContentfulPaint).padEnd(5)
      const lcp = safeFixed(r.largestContentfulPaint).padEnd(5)
      const tbt = safeFixed(r.totalBlockingTime).padEnd(5)
      const cls = safeFixed(r.cumulativeLayoutShift).padEnd(5)
      return `│ ${runNum} │ ${score}${isValueSafe('score', r.score) ? '✅' : '❌'} │ ${fcp}${isValueSafe('fcp', r.firstContentfulPaint) ? '✅' : '❌'} │ ${lcp}${isValueSafe('lcp', r.largestContentfulPaint) ? '✅' : '❌'} │ ${tbt}${isValueSafe('tbt', r.totalBlockingTime) ? '✅' : '❌'} │ ${cls}${isValueSafe('cls', r.cumulativeLayoutShift) ? '✅' : '❌'} │`
    }),
    '└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘'
  ].join('\n')

  const markdownTable = [
    '| Run # | Score | FCP | LCP | TBT | CLS |',
    '|-------|-------|-----|-----|-----|-----|',
    ...results.map((r, i) =>
      `| ${i + 1} | ${safeFixed(r.score)}${isValueSafe('score', r.score) ? '✅' : '❌'} | ${safeFixed(r.firstContentfulPaint)}${isValueSafe('fcp', r.firstContentfulPaint) ? '✅' : '❌'} | ${safeFixed(r.largestContentfulPaint)}${isValueSafe('lcp', r.largestContentfulPaint) ? '✅' : '❌'} | ${safeFixed(r.totalBlockingTime)}${isValueSafe('tbt', r.totalBlockingTime) ? '✅' : '❌'} | ${safeFixed(r.cumulativeLayoutShift)}${isValueSafe('cls', r.cumulativeLayoutShift) ? '✅' : '❌'} |`
    )
  ].join('\n')

  return { asciiTable, markdownTable }
}
