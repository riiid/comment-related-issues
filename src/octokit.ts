import {Octokit} from '@octokit/action';

export function createOctokit() {
  return new Octokit();
}

export class OctokitWrapper {
  constructor(
    private octokit: ReturnType<typeof createOctokit>,
    private owner: string,
    private repo: string,
  ) {
  }

  public getPull(prNumber: number) {
    return this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
  }

  public updatePull(prNumber: number, body: string) {
    return this.octokit.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      body,
    });
  }
}

