import * as core from '@actions/core';
import * as github from '@actions/github';
import main, { GroupLog } from './main';
import SimpleGit from 'simple-git';
import {OctokitWrapper, createOctokit} from './octokit';
import { TrackerIssuesExporter } from './types';
import { JiraIssueExporter } from './exporters/jira';

type CoreLogger = {
  startGroup: (groupName: string) => void;
  endGroup: () => void;
  info: (message: string) => void;
}

const getLogger = (coreLogger: CoreLogger): GroupLog => {
  let lastGroupName = '';
  return (groupName: string, message: string) => {
    if (lastGroupName !== groupName) {
      if (lastGroupName.length > 0) coreLogger.endGroup();
      coreLogger.startGroup(groupName);
      lastGroupName = groupName;
    }
    coreLogger.info(message);
  };
};

const createTrackerIssueExporter = (tracker: string) => {
  if (tracker === 'jira') {
    const jiraProtocol = core.getInput('jira-protocol') || 'https';
    if (jiraProtocol !== 'http' && jiraProtocol !== 'https') {
      throw new Error('Unexpected jira-protocol. It should be http or https');
    }
    const jiraHost = core.getInput('jira-host', {required: true});
    const jiraUsername = core.getInput('jira-username', {required: true});
    const jiraToken = core.getInput('jira-token', {required: true});
    return new JiraIssueExporter({
      host: jiraHost,
      protocol: jiraProtocol,
      token: jiraToken,
      username: jiraUsername,
    })
  } else {
    throw new Error('Unexpected tracker');
  }
}

(async () => {
  let success = true;
  try {
    const tracker = core.getInput('tracker', {required: true});
    const git = SimpleGit();
    const [owner, repo] = process.env.GITHUB_REPOSITORY!.split('/');
    const octokitWrapper = new OctokitWrapper(createOctokit(), owner, repo);
    const trackerIssueExporter: TrackerIssuesExporter = createTrackerIssueExporter(tracker);

    const path = core.getInput('path');
    const prNumber = github.context.payload.pull_request?.number;
    if (!prNumber) throw new Error('unexpected event');

    await main({
      octokit: octokitWrapper,
      trackerIssueExporter,
      git,
      prNumber,
      path: path || '.',
      projectKey: core.getInput('project-key'),
    }, getLogger(core));
  } catch (e) {
    core.error(e as Error);
    core.setFailed(e as Error);
    success = false;
  }

  core.setOutput('success', success);
})();

