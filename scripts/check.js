#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const required = [
  'Dockerfile', 'wrangler.jsonc', '.dev.vars.example',
  'server/index.js', 'server/db.js', 'server/auth.js', 'server/routes.js',
  'server/client-reports.js', 'server/engine.js', 'server/crews.js', 'server/migrate.js', 'server/seed-postgres.js',
  'supabase/migrations/202609070001_init.sql',
  'public/end-of-day.html', 'public/admin.html', 'public/client-reports.html',
];
let failed = false;
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`missing ${file}`); failed = true;
  }
}

const jsFiles = [];
for (const dir of ['server', 'scripts', 'src', 'public']) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) continue;
  for (const name of fs.readdirSync(full)) {
    if (/\.(js|mjs)$/.test(name)) jsFiles.push(path.join(dir, name));
  }
}
for (const file of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`syntax ${file}\n${r.stderr}`); failed = true;
  }
}

const eod = fs.readFileSync(path.join(root, 'public/end-of-day.html'), 'utf8');
const savePos = eod.indexOf('id="btnSave"');
const holdPos = eod.indexOf('<h2>Hold points</h2>');
if (!(savePos > holdPos)) { console.error('Save day is not below Hold points'); failed = true; }
if (!eod.includes('Plant and labour — ${T2W.esc(LABEL[tab.crew])}')) {
  console.error('Crew plant/labour panel not found'); failed = true;
}
if (!eod.includes('/plant-labour/options?')) {
  console.error('Plant/labour previous-day dropdown source not found'); failed = true;
}

const crews = fs.readFileSync(path.join(root, 'server/crews.js'), 'utf8');
if (!crews.includes("if (f > 0) all.push([0, f]);")) {
  console.error('Existing progress baseline protection not found in crew coverage'); failed = true;
}
if (crews.indexOf('for (const key of completeKeys || [])') > crews.indexOf('const earnedToday = clean')) {
  console.error('Point assets are calculated after earned value'); failed = true;
}

const seed = fs.readFileSync(path.join(root, 'server/seed-postgres.js'), 'utf8');
if (seed.includes('SET "Completion"=0')) {
  console.error('Invalid tblTrenchProgress Completion column remains'); failed = true;
}

const clientApi = fs.readFileSync(path.join(root, 'server/client-reports.js'), 'utf8');
for (const forbidden of [
  '"Earned ($)"', '"Profit ($)"', '"Our Cost Today ($)"', '"Cost Rate ($/h)"',
  '"Total Cost ($)"', '"Unit Rate ($)"',
]) {
  if (clientApi.includes(forbidden)) {
    console.error(`Client reports contain forbidden commercial field ${forbidden}`); failed = true;
  }
}

const index = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
if (!index.includes('clientViewerGuard') || !index.includes("app.use('/api/client-reports', clientReportRoutes)")) {
  console.error('Client viewer server-side access guard is missing'); failed = true;
}

const clientHtml = fs.readFileSync(path.join(root, 'public/client-reports.html'), 'utf8');
const inlineScripts = [...clientHtml.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
for (const script of inlineScripts) {
  try { new Function(script); } catch (err) {
    console.error(`syntax public/client-reports.html inline script\n${err.message}`); failed = true;
  }
}

if (failed) process.exit(1);
console.log(`T2W verification passed (${jsFiles.length} JavaScript files checked).`);
