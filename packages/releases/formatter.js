import { Octokit } from "@octokit/rest";
import { config } from "dotenv";

config();
const repoOrg = "lifejs";
const repoName = "lifejs";
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
async function findPRFromCommit(hash) {
  const { data } =
    await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner: repoOrg,
      repo: repoName,
      commit_sha: hash,
    });
  const pr = data.find((pr) => pr.merged_at) ?? data[0];
  return pr?.number ?? null;
}
async function getAuthors(source) {
  if (source.type === "pull-request") {
    const authors = new Set();
    const per_page = 100;
    for (let page = 1; ; page++) {
      const { data: commits } = await octokit.rest.pulls.listCommits({
        owner: repoOrg,
        repo: repoName,
        pull_number: source.id,
        per_page,
        page,
      });
      for (const c of commits) {
        authors.add(c.author?.login ?? c.commit.author?.name ?? "unknown");
      }
      if (commits.length < per_page) break;
    }
    return [...authors];
  }
  const { data } = await octokit.rest.repos.getCommit({
    owner: repoOrg,
    repo: repoName,
    ref: source.hash,
  });
  return [data.author?.login ?? data.commit.author?.name ?? "unknown"];
}
async function mergedPRCount(login) {
  const { data } = await octokit.rest.search.issuesAndPullRequests({
    q: `repo:${repoOrg}/${repoName} is:pr is:merged author:${login}`,
    per_page: 1,
  });
  return data.total_count;
}
const changelogFunctions = {
  getDependencyReleaseLine: async () => "",
  getReleaseLine: async (changeset, type) => {
    // Cleanly error if env variable is not set
    if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set.");
    // Block major versions unless explicitly uncommented
    if (type === "major")
      throw new Error("Uncomment this line to publish major versions.");
    // Error if the summary is empty
    if (!changeset.summary.trim())
      throw new Error(`Changeset '${changeset.id}' is empty.`);
    // Retrieve the source of the changeset
    const commitHash = changeset.commit;
    if (!commitHash)
      throw new Error(
        `Changeset '${changeset.id}' does not contain a commit hash.`
      );
    const pullRequestId = await findPRFromCommit(commitHash);
    const source = pullRequestId
      ? { type: "pull-request", id: pullRequestId }
      : { type: "commit", hash: commitHash };
    // Retrieve the authors of the source
    const authors = await getAuthors(source);
    // Retrieve whether the author is a new contributor
    const isNewContributor = Object.fromEntries(
      await Promise.all(
        authors.map(async (a) => [
          a,
          a === "LilaRest" ? false : (await mergedPRCount(a)) <= 1,
        ])
      )
    );
    // Generate and return release line
    const authorsWithLinks = authors.map(
      (author) =>
        `[@${author}](https://github.com/${author})${isNewContributor[author] ? " **(New contributor! 🎉)**" : ""}`
    );
    const sourceWithLinks =
      source.type === "commit"
        ? `[${source.hash.slice(0, 7)}](https://github.com/${repoOrg}/${repoName}/commit/${source.hash})`
        : `[#${source.id}](https://github.com/${repoOrg}/${repoName}/pull/${source.id})`;
    return `- ${authorsWithLinks.join(", ")} in ${sourceWithLinks} — ${capitalizeFirst(changeset.summary.trim())}`;
  },
};
export default changelogFunctions;
