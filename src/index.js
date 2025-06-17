const inquirer = require('inquirer')
const chalk = require('chalk')
const terminalImage = require('terminal-image').default
const path = require('path')

const { Octokit } = require('@octokit/rest')
const { runE2ETests, getAvailableTests } = require('./utils/e2e.js')
const { checkoutPRBranch, getDeploymentUrl } = require('./utils/pr.js')
const {
  getPRsWithReviews,
  handlePRReview,
  handleTestResults,
  getChangedHtmlFiles
} = require('./utils/review.js')
const { execSync } = require('child_process')
const { loadConfig, saveConfig } = require('./config.js')
const { handlePerf } = require('./utils/performance.js')
const prompts = require('./prompts.js')

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

async function displayLogo () {
  try {
    const logoPath = path.join(__dirname, '../assets/logo.png')
    console.log(await terminalImage.file(logoPath, { width: '10%' }))
  } catch (error) {
    console.error(chalk.red('Error displaying logo:'), error.message)
  }
}

async function main () {
  await displayLogo()
  console.log(chalk.blue('Welcome to Tahmid\'s Ciborg!'))
  await runTests()
}

main().catch(console.error)

async function promptForPR () {
  const lastConfig = loadConfig()
  const answers = await inquirer.prompt(prompts.promptForOwnerRepo(lastConfig))

  saveConfig(answers)

  const prs = await getPRsWithReviews({
    octokit,
    owner: answers.owner,
    repo: answers.repo
  })
  if (prs.length === 0) {
    console.log(chalk.yellow('No PRs found that need review'))
    return null
  }

  const { selectedPR } = await inquirer.prompt(prompts.promptForPRSelection(prs))

  return {
    ...answers,
    prNumber: selectedPR.number,
    prTitle: selectedPR.title,
    prUrl: selectedPR.url,
    previewUrl: selectedPR.previewUrl
  }
}

async function runTests () {
  while (true) {
    try {
      const prInfo = await promptForPR()
      if (!prInfo) {
        const { continueRunning } = await inquirer.prompt(prompts.promptForContinue)
        if (!continueRunning) {
          console.log(chalk.blue('Goodbye!'))
          break
        }
        continue
      }

      const { action } = await inquirer.prompt(prompts.promptForActions)

      if (action.includes('exit')) {
        console.log(chalk.blue('Goodbye!'))
        break
      }

      const deploymentUrl = await getDeploymentUrl({
        octokit,
        owner: prInfo.owner,
        repo: prInfo.repo,
        pr: {
          number: prInfo.prNumber
        }
      })

      if (deploymentUrl) {
        console.log(chalk.blue('\nFound deployment URL:'))
        console.log(chalk.green(deploymentUrl))
        prInfo.previewUrl = deploymentUrl
      }

      const changedHtmlFiles = await getChangedHtmlFiles({
        octokit,
        owner: prInfo.owner,
        repo: prInfo.repo,
        prNumber: prInfo.prNumber
      })

      if (prInfo.previewUrl && changedHtmlFiles.length === 1) {
        console.log(chalk.blue('\nUpdating preview URL to include the changed HTML file:'))
        console.log(chalk.yellow(`Original URL: ${prInfo.previewUrl}`))
        prInfo.previewUrl = `${prInfo.previewUrl}/${changedHtmlFiles[0]}`
        console.log(chalk.green(`Updated URL: ${prInfo.previewUrl}`))
      } else if (prInfo.previewUrl) {
        console.log(chalk.yellow(`\nFound ${changedHtmlFiles.length} changed HTML files, using base preview URL: ${prInfo.previewUrl}`))
      }

      let tempDir
      if (action.includes('e2e') || action.includes('unit')) {
        tempDir = await checkoutPRBranch({
          octokit,
          owner: prInfo.owner,
          repo: prInfo.repo,
          pr: {
            number: prInfo.prNumber,
            title: prInfo.prTitle,
            html_url: prInfo.prUrl
          }
        })
      }

      if (action.includes('e2e')) {
        const availableTests = await getAvailableTests(tempDir)
        if (availableTests.length === 0) {
          console.log(chalk.yellow('No e2e test files found in cypress/e2e directory'))
          continue
        }

        const { testSelection } = await inquirer.prompt(prompts.promptForTestSelection(availableTests))

        let selectedTests = []
        if (testSelection === 'specific') {
          const { tests } = await inquirer.prompt(prompts.promptForSpecificTests(availableTests))
          selectedTests = tests
        }

        console.log(chalk.yellow('\nRunning e2e tests...'))
        const e2eResults = await runE2ETests({
          octokit,
          owner: prInfo.owner,
          repo: prInfo.repo,
          pr: {
            number: prInfo.prNumber,
            title: prInfo.prTitle,
            html_url: prInfo.prUrl
          },
          selectedTests: testSelection === 'all' ? [] : selectedTests,
          tempDir
        })
        console.log(chalk.green('E2E Test Results:'))
        console.log(e2eResults)

        await handleTestResults({
          octokit,
          prInfo,
          results: e2eResults,
          testType: 'E2E'
        })
      }

      if (action.includes('unit')) {
        console.log(chalk.yellow('\nRunning unit tests...'))
        try {
          const unitTestResults = execSync('npm run test', { cwd: tempDir }).toString()
          console.log(chalk.green('Unit Test Results:'))
          console.log(unitTestResults)
          await handleTestResults({
            octokit,
            prInfo,
            results: unitTestResults,
            testType: 'Unit'
          })
        } catch (error) {
          console.error(chalk.red('Error running unit tests:'), error.message)
          await handleTestResults({
            octokit,
            prInfo,
            results: `Unit tests failed: ${error.message}`,
            testType: 'Unit'
          })
        }
      }

      if (action.includes('pagespeed')) {
        if (!prInfo.previewUrl) {
          console.log(chalk.yellow('No deployment preview URL found for this PR'))
          continue
        }

        const { numRuns } = await inquirer.prompt(prompts.promptForPageSpeedRuns)
        const { urls } = await inquirer.prompt(prompts.promptForPageSpeedUrl(prInfo.previewUrl, changedHtmlFiles))

        console.log(chalk.blue(`\nRunning PageSpeed tests on ${urls.length} URLs...`))

        const results = await handlePerf(urls, numRuns)
        // Display results for each URL
        for (const [url, { asciiTable }] of Object.entries(results)) {
          console.log(chalk.green(`\nPageSpeed Test Results for ${url}:`))
          console.log(asciiTable)
        }

        // Combine all markdown tables for PR comment
        const combinedMarkdown = Object.entries(results)
          .map(([url, { markdownTable }]) => `### PageSpeed Results for ${url}\n\n${markdownTable}`)
          .join('\n\n')

        await handleTestResults({
          octokit,
          prInfo,
          results: combinedMarkdown,
          testType: 'PageSpeed'
        })
      }

      await handlePRReview({
        octokit,
        prInfo
      })
      console.log(chalk.blue('\nPR Review completed successfully!'))
      console.log(chalk.blue('PR Link:'))
      console.log(chalk.green(prInfo.prUrl))
      console.log(chalk.blue('Goodbye!'))
      break
    } catch (error) {
      console.error(chalk.red('Error running tests:'), error.message)
    }

    console.log('\n')
  }
}
