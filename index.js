const github = require('@actions/github');
const core = require('@actions/core');
const pm = require('picomatch');
const format = require("string-template")

const octokit = github.getOctokit(core.getInput('github-token'));

async function run() {
    const baseBranches = (await octokit.repos.listBranches({
        "owner": core.getInput('repository-owner'),
        "repo": core.getInput('repository-name')
    })).data;

    const globs = JSON.parse(core.getInput('base-branch-filters'));
    if(!Array.isArray(globs)) {
        throw "base-branch-filters input is not an array";
    }

    const isMatch = pm(globs);
    for (const branch of baseBranches) {
        if (!isMatch(branch.name)) {
            continue;
        }

        await createPullRequest(core.getInput("head-branch"), branch.name);
    }
}

async function createPullRequest(head, base) {
    const owner = core.getInput('repository-owner');
    const repo = core.getInput('repository-name');

    head = `${owner}:${head}`;

    const hasPR = !!(await octokit.pulls.list({owner, repo, head, base})).data.length;
    const isIdentical = (await octokit.repos.compareCommits({owner, repo, base, head})).data.status === "identical";

    if(hasPR) {
        core.info(`Dont create a PR for ${head} into ${base}. PR already exists.`);
    } else if(isIdentical) {
        core.info(`Dont create a PR for ${head} into ${base}. Branches are identical.`);
    } else {
        const titleBodyVariables = {head, base};
        const labels = JSON.parse(core.getInput('pr-labels'));

        try {
            const pr = (await octokit.pulls.create({
                owner,
                repo,
                head: head,
                base: base,
                title: format(core.getInput("pr-title"), titleBodyVariables),
                body: format(core.getInput("pr-body"), titleBodyVariables),
            })).data;

            if(labels.length) {
                await octokit.issues.addLabels({
                    owner,
                    repo,
                    issue_number: pr.number,
                    labels
                });
            }

            core.info(`Created PR ${pr.number} - ${pr.title}`);
        }
        catch(error) {
            core.error(error.errors);
        }
    }
}

run().catch((error) => core.setFailed(error.message));
