<p align="center">
  <img src="assets/logo.png" alt="Ciborg Logo" width="200">
</p>

<h1 align="center">ciborg</h1>

<p align="center">Got tired clicking through the GitHub UI back and forth.</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="http://makeapullrequest.com"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

<h2 align="center">🚀 Features</h2>

- ✅ E2E testing with Cypress sandboxing
- ✅ PageSpeed performance analysis
- ✅ Unit test execution
- ✅ PR comments with test results

<h2 align="center">📋 Prerequisites</h2>

Before you begin, ensure you have the following:

- Node.js installed
- GitHub repository access
- Required API keys

<h2 align="center">🔧 Environment Variables</h2>

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub token with repository access |
| `PAGESPEED_API_KEY` | PageSpeed Insights API key |

<h2 align="center">🛠️ Installation & Setup</h2>

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the bot:
   ```bash
   npm start
   ```

<h2 align="center">🧪 Testing Configuration</h2>

### Cypress Setup
After cloning repositories for the first time, you'll need to manually set up Cypress environments.

Default ports:
- File serving: `8099`
- Sandboxing proxy: `8088`
