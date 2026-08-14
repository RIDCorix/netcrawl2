/* global console, process */

const repository = process.env.GH_REPOSITORY;
const token = process.env.GH_TOKEN;
if (!repository || !token) {
  throw new Error('GH_REPOSITORY and GH_TOKEN are required');
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned ${response.status}`);
  }
  return response.json();
}

const workflow = await github('/actions/workflows/test.yml');
if (workflow.state !== 'active') {
  throw new Error(`Test Suite workflow is ${workflow.state}, not active`);
}

const master = await github('/commits/master');
const runs = await github('/actions/workflows/test.yml/runs?branch=master&event=push&per_page=20');
const run = runs.workflow_runs.find(candidate => candidate.head_sha === master.sha);

if (!run) {
  throw new Error(`No Test Suite push run exists for master HEAD ${master.sha}`);
}
if (run.status !== 'completed') {
  throw new Error(`Test Suite run ${run.html_url} is ${run.status}`);
}
if (run.conclusion !== 'success') {
  throw new Error(`Test Suite run ${run.html_url} concluded ${run.conclusion}`);
}

console.log(`Test Suite is active and master HEAD passed: ${run.html_url}`);
