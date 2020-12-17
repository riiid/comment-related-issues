# Usage
```yaml
name: comment-related-issues

on:
  pull_request:
    branches: ["main"]

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - uses: ./.github/actions/comment-related-issues
        id: rcj
        with:
          tracker: jira
          jira-protocol: https
          jira-host: my-jira-host.com
          jira-username: john
          jira-token: ${{ secrets.JIRA_TOKEN }}
          path: ./my-project
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
__Note:__ The `fetch-depth` option in `actions/checkout@v2` needs to be set 0 because we need commit logs.

# Inputs
| Name          | Required | Default | Description                                                                                    |
| ------------- | :------: | ------- | ---------------------------------------------------------------------------------------------- |
| tracker       |    [x]   |         | Issue tracker name. Available values are jira                                                  |
| jira-protocol |    [ ]   | https   | Jira protocol. Available values are http and https. Default value is https. Required for Jira. |
| jira-host     |    [ ]   |         | Jira hostname. Required for Jira.                                                              |
| jira-username |    [ ]   |         | Jira username. Required for Jira.                                                              |
| jira-token    |    [ ]   |         | Jira token from the Jira account. Required for Jira.                                           |
| path          |    [ ]   | .       | Relative path from git repo's root to where you are interested in.                             |
