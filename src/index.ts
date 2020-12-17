import * as core from '@actions/core';
import * as github from '@actions/github';
import main, { GroupLog } from './main';
import JiraApi from 'jira-client';
import simpleGit from 'simple-git';
import {OctokitWrapper, createOctokit} from './octokit';

export type JiraClientConfig = {
  jiraProtocol: 'http' | 'https';
  jiraUsername: string;
  jiraHost: string;
  jiraToken: string;
};

const setupClients = ({jiraProtocol, jiraHost,jiraUsername, jiraToken}: JiraClientConfig) => {
  return {
    octokit: createOctokit(),
    jira: new JiraApi({
      protocol: jiraProtocol,
      host: jiraHost,
      username: jiraUsername,
      password: jiraToken,
      apiVersion: '2',
      strictSSL: true
    }),
    git: simpleGit(),
  };
};

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

(async () => {
  let success = true;
  try {
    const tracker = core.getInput('tracker', {
      required: true,
    });
    if (tracker === 'jira') {
      const jiraProtocol = core.getInput('jira-protocol') || 'https';
      if (jiraProtocol !== 'http' && jiraProtocol !== 'https') {
        throw new Error('Unexpected jira-protocol. It should be http or https');
      }
      const jiraHost = core.getInput('jira-host', {
        required: true,
      });
      const jiraUsername = core.getInput('jira-username', {
        required: true,
      });
      const jiraToken = core.getInput('jira-token', {
        required: true,
      });
      const path = core.getInput('path');

      const prNumber = github.context.payload.pull_request?.number;
      if (!prNumber) throw new Error('unexpected event');
      const clients = setupClients({
        jiraHost,
        jiraProtocol,
        jiraUsername,
        jiraToken,
      });

      const [owner, repo] = process.env.GITHUB_REPOSITORY!.split('/');

      const octokitWrapper = new OctokitWrapper(clients.octokit, owner, repo);

      await main({
        octokit: octokitWrapper,
        jira: clients.jira,
        git: clients.git,
        prNumber,
        path: path || '.',
      }, getLogger(core));
    }
  } catch (e) {
    core.error(e);
    core.setFailed(e);
    success = false;
  }

  core.setOutput('success', success);
})();

