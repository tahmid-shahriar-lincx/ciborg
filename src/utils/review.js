const chalk = require('chalk')
const inquirer = require('inquirer')

module.exports = {
  getPRsWithReviews,
  submitPRReview,
  commentOnPR,
  getChangedHtmlFiles,
  handlePRReview,
  handleTestResults
}

async function getPRsWithReviews (options) {
  const { octokit, owner, repo } = options
  try {
    const { data: pulls } = await octokit.pulls.list({ owner, repo, state: 'open' })
    const prsWithReviews = []
    for (const pr of pulls) {
      const { data: reviews } = await octokit.pulls.listRequestedReviewers({
        owner,
        repo,
        pull_number: pr.number
      })
      if (reviews.users && reviews.users.length > 0) {
        const { data: deployments } = await octokit.repos.listDeployments({
          owner,
          repo
        })
        let previewUrl = null
        const prString = `PR #${pr.number}`
        for (const deployment of deployments) {
          if (
            (deployment.environment && deployment.environment.includes(prString)) ||
            (deployment.original_environment && deployment.original_environment.includes(prString)) ||
            (deployment.description && deployment.description.includes(prString))
          ) {
            const { data: statuses } = await octokit.repos.listDeploymentStatuses({
              owner,
              repo,
              deployment_id: deployment.id
            })
            for (const status of statuses) {
              if (status.environment_url) {
                previewUrl = status.environment_url
                break
              }
            }
            if (previewUrl) break
          }
        }
        prsWithReviews.push({
          name: `#${pr.number}: ${pr.title}`,
          value: {
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            previewUrl
          }
        })
      }
    }
    return prsWithReviews
  } catch (error) {
    throw new Error(`Error fetching PRs: ${error.message}`)
  }
}

async function submitPRReview (options) {
  const { octokit, owner, repo, prNumber, action, reviewBody } = options
  try {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      event: action === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES',
      body: reviewBody
    })
    return true
  } catch (error) {
    throw new Error(`Error submitting PR review: ${error.message}`)
  }
}

async function commentOnPR (options) {
  const { octokit, owner, repo, prNumber, body } = options
  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body
    })
    return true
  } catch (error) {
    throw new Error(`Error commenting on PR: ${error.message}`)
  }
}

async function getChangedHtmlFiles (options) {
  const { octokit, owner, repo, prNumber } = options
  try {
    console.log(chalk.blue(`\nChecking for changed HTML files in PR #${prNumber}...`))
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber
    })
    console.log(chalk.yellow(`Found ${files.length} total changed files`))
    const changedHtmlFiles = files
      .filter(file => file.filename.endsWith('.html') && file.filename.startsWith('public/'))
      .map(file => {
        const path = file.filename
          .replace('public/', '')
          .replace('.html', '')
          .replace(/\/index$/, '')
        return path
      })
    console.log(chalk.green(`Found ${changedHtmlFiles.length} changed HTML files:`))
    changedHtmlFiles.forEach(file => console.log(chalk.green(`  - ${file}`)))
    return changedHtmlFiles
  } catch (error) {
    console.error(chalk.red('Error fetching changed HTML files:'), error.message)
    throw new Error(`Error fetching changed HTML files: ${error.message}`)
  }
}

async function handlePRReview (options) {
  const { octokit, prInfo } = options
  const { prAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'prAction',
      message: 'What would you like to do with this PR?',
      choices: [
        { name: 'Approve PR', value: 'approve' },
        { name: 'Request Changes', value: 'request_changes' },
        { name: 'Skip', value: 'skip' }
      ]
    }
  ])
  if (prAction === 'skip') {
    return
  }
  const defaultReviewBody = prAction === 'approve'
    ? 'All tests passed successfully. LGTM! 👍'
    : 'Please address the test results before proceeding.'
  const { customText } = await inquirer.prompt([
    {
      type: 'input',
      name: 'customText',
      message: `Enter ${prAction === 'approve' ? 'approval' : 'rejection'} text (press Enter to use default):`,
      default: defaultReviewBody
    }
  ])
  const finalReviewBody = customText || defaultReviewBody
  try {
    await submitPRReview({
      octokit,
      owner: prInfo.owner,
      repo: prInfo.repo,
      prNumber: prInfo.prNumber,
      action: prAction,
      reviewBody: finalReviewBody
    })
    console.log(chalk.green(`Successfully ${prAction === 'approve' ? 'approved' : 'requested changes for'} PR`))
  } catch (error) {
    console.error(chalk.red('Error submitting PR review:'), error.message)
  }
}

async function handleTestResults (options) {
  const { octokit, prInfo, results, testType } = options
  const { shouldComment } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldComment',
      message: `Would you like to comment these ${testType} results on the PR?`,
      default: true
    }
  ])
  if (shouldComment) {
    try {
      const commentBody = testType === 'E2E'
        ? `### E2E Test Results\n\n\`\`\`\n${results}\n\`\`\``
        : `### PageSpeed Test Results\n\n${results}`
      await commentOnPR({
        octokit,
        owner: prInfo.owner,
        repo: prInfo.repo,
        prNumber: prInfo.prNumber,
        body: commentBody
      })
      console.log(chalk.green(`Successfully commented ${testType} results on PR`))
    } catch (error) {
      console.error(chalk.red('Error commenting on PR:'), error.message)
    }
  }
}
