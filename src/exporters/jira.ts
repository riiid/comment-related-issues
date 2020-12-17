import JiraApi from 'jira-client';
import { IssueSummary, TrackerIssuesExporter } from '../types';

export type JiraClientConfig = {
  protocol: 'http' | 'https';
  username: string;
  host: string;
  token: string;
};

export class JiraIssueExporter implements TrackerIssuesExporter {
  private jira: JiraApi;
  constructor(
    private config: JiraClientConfig
  ) {
    const {protocol: jiraProtocol, host: jiraHost, username: jiraUsername, token: jiraToken} = config;
    this.jira = new JiraApi({
      protocol: jiraProtocol,
      host: jiraHost,
      username: jiraUsername,
      password: jiraToken,
      apiVersion: '2',
      strictSSL: true
    });
  }
  async findIssue(issueNumber: string): Promise<IssueSummary> {
    const issue = await this.jira.findIssue(issueNumber);
    return {
      title: issue.fields.summary,
      link: issue.self,
    };
  }
}
