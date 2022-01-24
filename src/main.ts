import { SimpleGit } from 'simple-git';
import { OctokitWrapper } from './octokit';
import { IssueSummary, TrackerIssuesExporter } from './types';

export type GroupLog = (groupName: string, message: string) => void;

export type MainInputs = {
  octokit: OctokitWrapper;
  trackerIssueExporter: TrackerIssuesExporter;
  git: SimpleGit;
  prNumber: number;
  path: string;
};

const renderTable = (header: string[], body: string[][]): string => {
  const wrap = (s: string, w: string) => w + s + w;

  const headerString = wrap(header.join('|'), '|');
  const headerBody = body.map(row => wrap(row.join('|'), '|'));
  return [headerString, '|---|---|', ...headerBody].join('\n');
};

const wrapTableWithComment = (table: string) => {
  return ['<!--RELATED-ISSUE-START-->', '## Related Issues (Auto updated)', table, '<!--RELATED-ISSUE-END-->'].join('\n');
}

const replaceIssueTableString = (body: string, table: string) => {
  const result = body.replace(/<!--RELATED-ISSUE-START-->(.|\s)*<!--RELATED-ISSUE-END-->/, wrapTableWithComment(table));
  return result;
};

const appendIssueTableString = (body: string, table: string) => {
  return body + '\n' + wrapTableWithComment(table);
};

const ensureIssueTableString = (body: string, table: string, replace: boolean) => {
  const newBody = replace ? replaceIssueTableString(body, table) : appendIssueTableString(body, table);
  return newBody;
};

class IssueNumberTitleExporter {
  constructor(
    private octokit: OctokitWrapper,
    private trackerIssueExporter: TrackerIssuesExporter,
    private git: SimpleGit,
    private log: GroupLog = () => {},
  ) {}

  private async listCommits(from: string, to: string, path: string): Promise<Array<{hash: string; message: string;}>> {
    const bestAncestor = (await this.git.raw(['merge-base', from, to])).trim();
    const logs = await this.git.log({
      from,
      to: bestAncestor,
      file: path,
    });
    return logs.all.map(({hash, message}) => ({hash, message}));
  }

  private extractIssueNumbers (s: string): string[] {
    let result: string[] = [];
    let x;
    const regex = /([a-z-A-Z]+-\d+)/g;
    while ((x = regex.exec(s)) !== null) {
      result = result.concat(x.slice(1));;
    }
    return result;
  };

  private async listUniqueIssueNumbers(from: string, to: string, path: string): Promise<string[]> {
    const commits = await this.listCommits(from, to, path);

    const logGroup = 'List commits';
    this.log(logGroup, `commits length: ${commits.length}`);
    for (const commit of commits) {
      this.log(logGroup, `${commit.hash} ${commit.message}`);
    }

    const commitMessages = commits.map(commit => commit.message);

    const allIssueNumbers = commitMessages.flatMap(msg => this.extractIssueNumbers(msg));
    const uniqueIssueNumbers = [...new Set(allIssueNumbers)];
    return uniqueIssueNumbers.sort();
  };

  private async getIssueFromTracker(issueNumber: string): Promise<IssueSummary> {
    return this.trackerIssueExporter.findIssue(issueNumber);
  }

  private async listIssueNumberTitles(from: string, to: string, path: string): Promise<[string, string][]> {
    const issueNumbers = await this.listUniqueIssueNumbers(from, to, path);
    let issueNumberTitlePairs: [string, string][] = [];

    const logGroup = 'Get issue title for each issue number';
    for (let i = 0; i < issueNumbers.length; ++i) {
      const issueNumber = issueNumbers[i];
      try {
        const {title, link} = await this.getIssueFromTracker(issueNumber);
        issueNumberTitlePairs.push([`[${issueNumber}](${link})`, title]);
        this.log(logGroup, `[${i + 1}/${issueNumbers.length}] Success: [${issueNumber}] | ${title}`);
      } catch (e) {
        this.log(logGroup, `[${i + 1}/${issueNumbers.length}] Fail: [${issueNumber}] ${e.toString()}`);
      }
    }
    return issueNumberTitlePairs;
  }

  public async listIssueNumberTitlesFromPR(prNumber: number, path: string): Promise<[string, string][]> {
    const response = await this.octokit.getPull(prNumber);
    if (response.data.base.repo.full_name !== response.data.head.repo.full_name) {
      throw new Error(`can't get diff`);
    }

    const from = response.data.head.sha;
    const to = response.data.base.sha;

    this.log('Start', `compute log from ${from} to ${to} for ${path}`);

    return this.listIssueNumberTitles(from, to, path);
  }
}

const main = async (inputs: MainInputs, log: GroupLog) => {
  const {octokit, trackerIssueExporter, git} = inputs;

  const issueNumberTitleExporter = new IssueNumberTitleExporter(octokit, trackerIssueExporter, git, log);
  const issueNumberTitles = await issueNumberTitleExporter.listIssueNumberTitlesFromPR(inputs.prNumber, inputs.path);
  const tableString = renderTable(['#issue', 'title'], issueNumberTitles);
  const body = (await octokit.getPull(inputs.prNumber)).data.body;
  const alreadyAppended = body.includes('-RELATED-ISSUE-START-');

  const logGroup = 'Attach table';

  log(logGroup, '\n-------------------Table-------------------\n');
  log(logGroup, tableString);
  log(logGroup, '\n-------------------Table-------------------\n');
  if (alreadyAppended) {
    log(logGroup, 'Related issues table already exists, just replace');
  } else {
    log(logGroup, 'Append related issues table');
  }
  const newBody = ensureIssueTableString(body, tableString, alreadyAppended);

  log(logGroup, '\n-------------------Old body-------------------\n');
  log(logGroup, body);
  log(logGroup, '\n-------------------Old body-------------------\n');
  log(logGroup, '\n-------------------New body-------------------\n');
  log(logGroup, newBody);
  log(logGroup, '\n-------------------New body-------------------\n');

  return await octokit.updatePull(inputs.prNumber, newBody);
};

export default main;
