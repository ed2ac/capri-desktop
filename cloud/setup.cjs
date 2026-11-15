#!/usr/bin/env node
'use strict';

// Sets up Capri's cloud on your Cloudflare account, step by step:
//   1. you log in (a browser page);  2. her store (KV) is made;  3. your Discord server and user ids;
//   4. your Discord bot's token (typed here, kept by Cloudflare, never in a file);
//   5. a key for Capri, made here: paste it in her panel;  6. published.
// Run it again any time: what's done is kept.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { execSync, spawnSync } = require('node:child_process');

const TOML = path.join(__dirname, 'wrangler.toml');
const wr = (args, opts = {}) => spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', shell: process.platform === 'win32', cwd: __dirname, ...opts });
const out = (args) => execSync(`npx wrangler ${args}`, { cwd: __dirname, encoding: 'utf8' });

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let toml = fs.readFileSync(TOML, 'utf8');

  console.log('\n1/6  Login no Cloudflare (abre o navegador)…');
  let who = '';
  try { who = out('whoami 2>&1'); } catch (err) { who = String(err.stdout || ''); }
  if (/not authenticated|not logged in|wrangler login/i.test(who)) wr(['login']);

  if (/id = "FILL_BY_SETUP"/.test(toml)) {
    console.log('\n2/6  Criando o armazenamento (KV)…');
    const made = out('kv namespace create STORE');
    const id = (/id = "([0-9a-f]{32})"/.exec(made) || /"id":\s*"([0-9a-f]{32})"/.exec(made) || [])[1];
    if (!id) throw new Error(`não achei o id do KV na resposta:\n${made}`);
    toml = toml.replace('id = "FILL_BY_SETUP"', `id = "${id}"`);
    fs.writeFileSync(TOML, toml);
  }

  if (/GUILD_ID = "FILL_BY_SETUP"/.test(toml)) {
    console.log('\n3/6  Seus IDs do Discord (Configurações › Avançado › Modo desenvolvedor; depois clique com o botão direito › Copiar ID):');
    const guild = (await rl.question('   ID do seu servidor (onde o bot está): ')).trim();
    const user = (await rl.question('   Seu ID de usuário: ')).trim();
    if (!/^\d{15,22}$/.test(guild) || !/^\d{15,22}$/.test(user)) throw new Error('IDs do Discord são só números (17 a 20 dígitos)');
    toml = toml.replace('GUILD_ID = "FILL_BY_SETUP"', `GUILD_ID = "${guild}"`).replace('USER_ID = "FILL_BY_SETUP"', `USER_ID = "${user}"`);
    fs.writeFileSync(TOML, toml);
  }
  rl.close();

  console.log('\n4/6  Publicando…');
  const dep = wr(['deploy'], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' });
  process.stdout.write(dep.stdout || '');
  if (dep.status !== 0) throw new Error('a publicação falhou');
  const url = (/https:\/\/[\w.-]+\.workers\.dev/.exec(dep.stdout || '') || [])[0];

  console.log('\n5/6  O token do seu bot do Discord (cole quando pedir; fica guardado no Cloudflare):');
  wr(['secret', 'put', 'DISCORD_TOKEN']);

  console.log('\n6/6  A chave da Capri…');
  const key = crypto.randomBytes(24).toString('base64url');
  spawnSync('npx', ['wrangler', 'secret', 'put', 'CAPRI_KEY'], { input: `${key}\n`, stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32', cwd: __dirname });
  console.log(`\nPronto! No menu da Capri, "Ligar a nuvem da Capri", cole:\n   Endereço: ${url || 'https://capri-cloud.<sua-conta>.workers.dev (aparece acima, no deploy)'}\n   Chave:    ${key}\n`);
})().catch((err) => { console.error(`\nNão deu: ${err.message}`); process.exit(1); });
