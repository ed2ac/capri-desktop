#!/usr/bin/env node
'use strict';

// Her offline voice's engine (src/vendor/transformers): a few files from two npm packages, fetched
// with `npm pack` (which checks each package's integrity) and checked again here against the hashes
// they had when we picked them. Not kept in git (big, and third-party). Runs before every build
// (npm run dist); does nothing when the files are there and right.
//
//   npm run vendor

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const DIR = path.join(__dirname, '..', 'src', 'vendor', 'transformers');
const PACKAGES = [
  {
    spec: '@huggingface/transformers@4.3.2',
    files: {
      'dist/transformers.web.min.js': 'ecaf2c7dce4bcbe882d1ec6e67c2f537720e0e47169e5f7e60f2c019fba91682',
      LICENSE: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
    },
  },
  {
    spec: 'onnxruntime-web@1.31.0-dev.20260914-8d85527a0',
    files: {
      'dist/ort.webgpu.min.mjs': '5dd65363be87d182ce0617665489cab4b78359cea9f04d813b2a423c9be651a1',
      'dist/ort-wasm-simd-threaded.jsep.mjs': 'c2f80e915e9df63289788a99d434d8c4e00e64e9c1f030f4b80b022458dd2c99',
      'dist/ort-wasm-simd-threaded.jsep.wasm': '62ff86b2f2fa3a79eb87a7e4720e8ea9051942bf975f314181bf7dcef2feac06',
      'dist/ort-wasm-simd-threaded.asyncify.mjs': '0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611',
      'dist/ort-wasm-simd-threaded.asyncify.wasm': '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
    },
  },
];

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const dest = (inPkg) => path.join(DIR, path.basename(inPkg));
const ok = (inPkg, hash) => fs.existsSync(dest(inPkg)) && sha(dest(inPkg)) === hash;

fs.mkdirSync(DIR, { recursive: true });
for (const pkg of PACKAGES) {
  if (Object.entries(pkg.files).every(([f, h]) => ok(f, h))) continue;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-vendor-'));
  try {
    const shell = process.platform === 'win32';
    const tgz = execFileSync('npm', ['pack', pkg.spec, '--silent'], { cwd: tmp, encoding: 'utf8', shell }).trim().split('\n').pop();
    execFileSync('tar', ['-xzf', tgz, ...Object.keys(pkg.files).map((f) => `package/${f}`)], { cwd: tmp, shell });
    for (const [f, hash] of Object.entries(pkg.files)) {
      const got = path.join(tmp, 'package', f);
      if (sha(got) !== hash) throw new Error(`${pkg.spec} ${f}: hash mismatch`);
      fs.copyFileSync(got, dest(f));
    }
    console.log(`vendor: ${pkg.spec} ok`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
