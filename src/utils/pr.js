const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const chalk = require('chalk')
const { loadConfig } = require('../config.js')

module.exports = {
  getDeploymentUrl,
  getUpdatedRoutes,
  getConventionalCommitType,
  checkoutPRBranch
}

async function getDeploymentUrl ({ octokit, owner, repo, pr }) {
  const deployments = await octokit.paginate(octokit.rest.repos.listDeployments, {
    owner,
    repo,
    per_page: 100
  })
  const prString = `#${pr.number}`
  for (const deployment of deployments) {
    if (
      (deployment.environment && deployment.environment.includes(prString)) ||
      (deployment.original_environment && deployment.original_environment.includes(prString)) ||
      (deployment.description && deployment.description.includes(prString))
    ) {
      const statuses = await octokit.rest.repos.listDeploymentStatuses({
        owner,
        repo,
        deployment_id: deployment.id
      })
      for (const status of statuses.data) {
        if (status.environment_url) {
          return status.environment_url
        }
      }
    }
  }
  return null
}

async function getUpdatedRoutes ({ octokit, owner, repo, pr }) {
  const files = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: pr.number
  })
  return files.data
    .filter(file => file.filename.endsWith('.html') && file.filename.startsWith('public/'))
    .map(file => {
      const path = file.filename
        .replace('public/', '')
        .replace('.html', '')
        .replace(/\/index$/, '')
      return path
    })
}

function getConventionalCommitType (commitMessage) {
  const conventionalTypes = [
    'feat', 'fix', 'docs', 'style', 'refactor',
    'perf', 'test', 'build', 'ci', 'chore', 'revert'
  ]
  const typeRegex = new RegExp(`^(${conventionalTypes.join('|')})(\\(.+\\))?:`, 'i')
  const match = commitMessage.match(typeRegex)
  return match ? match[1].toLowerCase() : null
}

async function checkoutPRBranch ({ octokit, owner, repo, pr }) {
  const projectRoot = path.resolve(__dirname, '..', '..')
  const tmpDir = path.join(projectRoot, 'tmp')
  const repoDir = path.join(tmpDir, `${owner}-${repo}`)
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true })
  }
  if (!fs.existsSync(repoDir)) {
    const config = loadConfig()
    const gitHost = config.gitHost
    execSync(`git clone git@${gitHost}:${owner}/${repo}.git ${repoDir}`, { stdio: 'inherit' })
  }
  process.chdir(repoDir)
  const prDetails = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pr.number
  })
  const branchName = prDetails.data.head.ref
  console.log(chalk.blue('Found branch name:', branchName))
  execSync('git switch main', { stdio: 'inherit' })
  console.log(chalk.yellow('About to fetch branch:', branchName))
  execSync(`git fetch -v origin ${branchName}`, { stdio: 'inherit' })
  console.log(chalk.green('Fetch completed'))
  execSync(`git checkout ${branchName}`, { stdio: 'inherit' })
  execSync('git reset --hard origin/' + branchName, { stdio: 'inherit' })
  execSync('npm install', { stdio: 'inherit' })
  return repoDir
}
