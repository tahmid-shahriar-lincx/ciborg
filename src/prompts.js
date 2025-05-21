module.exports = {
  promptForOwnerRepo: (lastConfig) => [
    {
      type: 'input',
      name: 'owner',
      message: 'Enter repository owner:',
      default: lastConfig.owner,
      validate: input => input.length > 0 || 'Owner name is required'
    },
    {
      type: 'input',
      name: 'repo',
      message: 'Enter repository name:',
      default: lastConfig.repo,
      validate: input => input.length > 0 || 'Repository name is required'
    }
  ],

  promptForPRSelection: (prs) => [
    {
      type: 'list',
      name: 'selectedPR',
      message: 'Select a PR to run tests on:',
      choices: prs
    }
  ],

  promptForContinue: [
    {
      type: 'confirm',
      name: 'continueRunning',
      message: 'Would you like to try another repository?',
      default: true
    }
  ],

  promptForActions: [
    {
      type: 'checkbox',
      name: 'action',
      message: 'Select actions to run:',
      choices: [
        { name: 'Run e2e tests', value: 'e2e' },
        { name: 'Run pagespeed test', value: 'pagespeed' },
        { name: 'Run unit tests', value: 'unit' },
        { name: 'Exit', value: 'exit' }
      ],
      validate: input => {
        if (input.includes('exit') && input.length > 1) {
          return 'Cannot select exit with other options'
        }
        return input.length > 0 || 'Please select at least one action'
      }
    }
  ],

  promptForTestSelection: (availableTests) => [
    {
      type: 'list',
      name: 'testSelection',
      message: 'Select which tests to run:',
      choices: [
        { name: 'Run all tests', value: 'all' },
        { name: 'Select specific tests', value: 'specific' }
      ]
    }
  ],

  promptForSpecificTests: (availableTests) => [
    {
      type: 'checkbox',
      name: 'tests',
      message: 'Select tests to run:',
      choices: availableTests
    }
  ],

  promptForPageSpeedRuns: [
    {
      type: 'number',
      name: 'numRuns',
      message: 'How many times would you like to run the PageSpeed test?',
      default: 5,
      validate: input => input > 0 || 'Please enter a positive number'
    }
  ]
}
