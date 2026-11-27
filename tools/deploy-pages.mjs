// npm run pages: build the game and publish dist/ to the gh-pages branch, which GitHub Pages serves at
// https://dragoonant.github.io/iron-basin/ (PLAN Q11). Each run adds one commit on top of gh-pages; no force push.
// It refuses to publish if the build mentions the owner's real name or a home path (CLAUDE.md).
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sh = (cmd, cwd = '.') => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
sh('npm run build');
// The words to keep out (the owner's real name and email) never live in the repo: they come from an untracked
// `.private-words` file (git-ignored, one per line) or IB_PRIVATE_WORDS (comma-separated), plus any home path.
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = [...(existsSync('.private-words') ? readFileSync('.private-words', 'utf8').split('\n') : []), ...(process.env.IB_PRIVATE_WORDS ?? '').split(',')].map((w) => w.trim()).filter((w) => w.length > 2);
if (!words.length) console.warn('pages: no .private-words file or IB_PRIVATE_WORDS set: only home paths are checked');
const banned = [...words.map((w) => new RegExp(esc(w), 'i')), /\/home\/[a-z]/, /\/Users\//];
const scan = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) scan(p); else if (/\.(html|js|css|json|txt|md)$/.test(n)) { const t = readFileSync(p, 'utf8'); for (const b of banned) if (b.test(t)) throw new Error(`refusing to publish: ${p} matches ${b}`); } } };
scan('dist');

const remote = sh('git remote get-url origin');
const head = sh('git rev-parse --short HEAD');
const work = mkdtempSync(join(tmpdir(), 'ib-pages-'));
const hasBranch = sh(`git ls-remote --heads ${JSON.stringify(remote)} gh-pages`).length > 0;
if (hasBranch) sh(`git clone --depth 1 --branch gh-pages ${JSON.stringify(remote)} .`, work);
else { sh('git init -q', work); sh('git checkout -q --orphan gh-pages', work); }
for (const n of readdirSync(work)) if (n !== '.git') rmSync(join(work, n), { recursive: true, force: true });
cpSync('dist', work, { recursive: true });
writeFileSync(join(work, '.nojekyll'), '');
const name = sh('git config user.name'), email = sh('git config user.email');
sh('git add -A', work);
if (!sh('git status --porcelain', work)) { console.log('pages: nothing changed'); process.exit(0); }
sh(`git -c user.name=${JSON.stringify(name)} -c user.email=${JSON.stringify(email)} commit -q -m ${JSON.stringify(`Pages: IRON BASIN build of ${head}`)}`, work);
sh(`git push -q ${JSON.stringify(remote)} gh-pages`, work);
rmSync(work, { recursive: true, force: true });
console.log(`pages: published ${head} to gh-pages: https://dragoonant.github.io/iron-basin/`);
