#!/usr/bin/env node
'use strict';

// A new version of her for everyone who has her (and for you: she updates herself, asking first).
// On Windows, in the build folder, after `npm run dist`: uploads the installer and its latest.yml to
// a GitHub release of this version, with gh (logged in). Bump "version" in package.json first.
//
//   npm run dist && npm run release

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { version, build } = require('../package.json');
const repo = `${build.publish[0].owner}/${build.publish[0].repo}`;
const dist = path.join(__dirname, '..', 'dist');
const files = fs.readdirSync(dist).filter((f) => f === 'latest.yml' || (f.includes(version) && /\.(exe|blockmap)$/.test(f))).map((f) => path.join(dist, f));
if (!files.some((f) => f.endsWith('latest.yml'))) throw new Error('no dist/latest.yml: run npm run dist first');
const gh = (args) => execFileSync('gh', args, { stdio: 'inherit' }); // no shell: it would split "Capri 0.8.0" in two
try {
  gh(['release', 'view', `v${version}`, '--repo', repo]);
  gh(['release', 'upload', `v${version}`, ...files, '--clobber', '--repo', repo]);
} catch {
  gh(['release', 'create', `v${version}`, ...files, '--repo', repo, '--title', `Capri ${version}`, '--notes', `Capri ${version}`]);
}
console.log(`released v${version}: ${files.map((f) => path.basename(f)).join(', ')}`);
