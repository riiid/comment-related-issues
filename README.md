# Usage
```yaml
name: report commit jira

on:
  pull_request:
    branches: ["*"]

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - uses: ./.github/actions/report-commit-jira
        id: rcj
        with:
          jira-token: ${{ secrets.JIRA_TOKEN }}
          path: ./.github/actions/report-commit-jira
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
__Note:__ The `fetch-depth` option in `actions/checkout@v2` needs to be set 0 because we need commit logs.

## Inputs
| Name        | Required   | Default | Description|
| ------------| :--------: | --- | --- |
| jira-token  | [x]        |  | A jira token from the account `www.dev+jira@riiid.co`. |
| path        | [ ]        |  | A path which you are interested in for the commits. |
