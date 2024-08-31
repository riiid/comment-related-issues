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
  projectKey?: string;
  includeScope?: boolean;
};

export type IssueInfo = {
  issueNumber: string;
  title: string;
  scopes: string[];
};

const renderTable = (header: string[], body: string[][]): string => {
  const wrap = (s: string, w: string) => w + s + w;

  const headerString = wrap(header.join('|'), '|');
  const headerBody = body.map(row => wrap(row.join('|'), '|'));
  return [headerString, '|' + header.map(() => '---').join('|') + '|', ...headerBody].join('\n');
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

// extract scope from commit message
// e.g. fix(scope): message -> scope
// e.g. fix: message -> undefined
const extractScopeFromCommitMessage = (message: string): string | undefined => {
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?:/);
  return match ? match[2] : undefined;
};

class IssueNumberTitleExporter {
  constructor(
    private octokit: OctokitWrapper,
    private trackerIssueExporter: TrackerIssuesExporter,
    private git: SimpleGit,
    private log: GroupLog = () => {},
    private projectKey?: string,
    private includeScope: boolean = false
  ) {}

  private async listCommits(from: string, to: string, path: string): Promise<Array<{hash: string; message: string; body: string}>> {
    const bestAncestor = (await this.git.raw(['merge-base', from, to])).trim();
    const logs = await this.git.log({
      from,
      to: bestAncestor,
      file: path,
    });
    return logs.all.map(({hash, message, body}) => ({hash, message, body}));
  }

  private extractIssueNumbersWithScope(str: string): Array<{ issueNumber: string; scope?: string }> {
    const strs = str.split('\n');
    const result: Array<{ issueNumber: string; scope?: string }> = [];
    for (const line of strs) {
      const uprStr = line.toUpperCase();
      let x;
      const regex = this.projectKey ? new RegExp(`(${this.projectKey.toUpperCase()}-\\d+)`, 'g') :  /([A-Z]?[A-Z0-9]+-\d+)/g
      while ((x = regex.exec(uprStr)) !== null) {
        const issueNumber = x[1];
        const scope = this.includeScope ? extractScopeFromCommitMessage(line) : undefined;
        result.push({ issueNumber, scope });
      }
    }
    return result;
  }

  private async listUniqueIssueNumbers(from: string, to: string, path: string): Promise<Map<string, Set<string>>> {
    const commits = await this.listCommits(from, to, path);

    const logGroup = 'List commits';
    this.log(logGroup, `commits length: ${commits.length}`);
    for (const commit of commits) {
      this.log(logGroup, `${commit.hash} ${commit.message}`);
    }

    const commitMessages = commits.map(commit => commit.message + (commit.body ? `\n${commit.body}` : ''));

    const allIssueNumbers = commitMessages.flatMap(msg => this.extractIssueNumbersWithScope(msg));
    const uniqueIssueNumbersMap = new Map<string, Set<string>>();

    allIssueNumbers.forEach(({ issueNumber, scope }) => {
      if (!uniqueIssueNumbersMap.has(issueNumber)) {
        uniqueIssueNumbersMap.set(issueNumber, new Set());
      }
      if (scope) {
        uniqueIssueNumbersMap.get(issueNumber)!.add(scope);
      }
    });

    return uniqueIssueNumbersMap;
  };

  private async getIssueFromTracker(issueNumber: string): Promise<IssueSummary> {
    return this.trackerIssueExporter.findIssue(issueNumber);
  }

  private async listIssueNumberTitles(from: string, to: string, path: string): Promise<IssueInfo[]> {
    const issueNumbersMap = await this.listUniqueIssueNumbers(from, to, path);
    let issueNumberTitlePairs: IssueInfo[] = [];

    const logGroup = 'Get issue title for each issue number';
    let i = 0;
    for (const [issueNumber, scopes] of issueNumbersMap.entries()) {
      i++;
      try {
        const {title, link} = await this.getIssueFromTracker(issueNumber);
        issueNumberTitlePairs.push({
          issueNumber: `[${issueNumber}](${link})`,
          title,
          scopes: Array.from(scopes)
        });
        this.log(logGroup, `[${i}/${issueNumbersMap.size}] Success: [${issueNumber}] | ${title} | Scopes: ${Array.from(scopes).join(', ')}`);
      } catch (e) {
        this.log(logGroup, `[${i}/${issueNumbersMap.size}] Fail: [${issueNumber}] ${(e as Error).toString()}`);
      }
    }
    return issueNumberTitlePairs;
  }

  public async listIssueNumberTitlesFromPR(prNumber: number, path: string): Promise<IssueInfo[]> {
    const response = await this.octokit.getPull(prNumber);
    if (response.data.base.repo.full_name !== response.data.head.repo.full_name) {
      throw new Error(`can't get diff`);
    }

    const from = response.data.head.sha;
    const to = response.data.base.sha;

    const logGroup = 'Start';
    this.log(logGroup, `compute log from ${from} to ${to} for ${path}`);
    this.log(logGroup, this.projectKey ? `Project key is ${this.projectKey}`: 'no key input');
    return this.listIssueNumberTitles(from, to, path);
  }
}

const main = async (inputs: MainInputs, log: GroupLog) => {
  const {octokit, trackerIssueExporter, git, projectKey, includeScope} = inputs;

  const issueNumberTitleExporter = new IssueNumberTitleExporter(octokit, trackerIssueExporter, git, log, projectKey, includeScope);
  const issueNumberTitles = await issueNumberTitleExporter.listIssueNumberTitlesFromPR(inputs.prNumber, inputs.path);
  const tableHeaders = includeScope ? ['#issue', 'title', 'scopes'] : ['#issue', 'title'];
  const tableString = renderTable(tableHeaders, issueNumberTitles.map(({ issueNumber, title, scopes }) =>
    includeScope ? [issueNumber, title, scopes.join(', ')] : [issueNumber, title]
  ));
  const body = (await octokit.getPull(inputs.prNumber)).data.body ?? '';
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
