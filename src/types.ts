export interface IssueSummary {
  title: string;
  link: string;
}

export interface TrackerIssuesExporter {
  findIssue(issueNumber: string): Promise<IssueSummary>;
}
