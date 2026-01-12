/**
 * Fetches the user's repos, selects the top repositories, and replaces the
 * content between <!-- START_FEATURED --> and <!-- END_FEATURED --> in README.md.
 *
 * Uses the GITHUB_TOKEN provided by the workflow for authenticated API calls.
 *
 * Environment variables required:
 *   - GITHUB_TOKEN
 *   - GH_USERNAME (defaults to 'renakome' if not set)
 */

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN;
const USER = process.env.GH_USERNAME || 'renakome';
if (!TOKEN) {
  console.error('GITHUB_TOKEN is required in env');
  process.exit(1);
}

const headers = {
  Authorization: `token ${TOKEN}`,
  'User-Agent': 'update-readme-script',
  Accept: 'application/vnd.github.v3+json',
};

async function fetchAllRepos() {
  const perPage = 100;
  let page = 1;
  let all = [];

  while (true) {
    const url = `https://api.github.com/users/${USER}/repos?per_page=${perPage}&page=${page}&type=owner`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch repos: ${res.status} ${text}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all = all.concat(data);
    if (data.length < perPage) break;
    page += 1;
  }
  return all;
}

function generateList(repos, limit = 6) {
  // Sort by recent push date and then by stars
  repos.sort((a, b) => {
    const d = new Date(b.pushed_at) - new Date(a.pushed_at);
    if (d !== 0) return d;
    return b.stargazers_count - a.stargazers_count;
  });
  const pick = repos.slice(0, limit);
  return pick
    .map(r => {
      const desc = (r.description || '').replace(/\r?\n|\r/g, ' ').trim();
      return `- [${r.name}](${r.html_url})${desc ? ` — ${desc}` : ''}`;
    })
    .join('\n');
}

async function main() {
  console.log(`Fetching repos for ${USER}...`);
  const repos = await fetchAllRepos();
  if (!repos.length) {
    console.log('No repositories found.');
    return;
  }
  const listMd = generateList(repos);
  const readmePath = path.join(process.cwd(), 'README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');

  const startMarker = '<!-- START_FEATURED -->';
  const endMarker = '<!-- END_FEATURED -->';

  if (!readme.includes(startMarker) || !readme.includes(endMarker)) {
    console.error('Markers not found in README.md. Add <!-- START_FEATURED --> and <!-- END_FEATURED --> around the featured section.');
    process.exit(1);
  }

  const before = readme.split(startMarker)[0] + startMarker + '\n';
  const after = '\n' + endMarker + readme.split(endMarker).slice(1).join(endMarker);

  const newReadme = `${before}${listMd}${after}`;

  if (newReadme === readme) {
    console.log('No changes to README.md');
  } else {
    fs.writeFileSync(readmePath, newReadme, 'utf8');
    console.log('README.md updated with featured projects:');
    console.log(listMd);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
