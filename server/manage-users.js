#!/usr/bin/env node
/**
 * Supabase Auth user management for T2W.
 *
 *   node server/manage-users.js add <username> <password> ["Full Name"] [role] [email]
 *   node server/manage-users.js list
 *   node server/manage-users.js remove <username>
 *   node server/manage-users.js password <username> <new-password>
 *   node server/manage-users.js role <username> <admin|editor|viewer>
 */
const db = require('./db');
const { createUser, listUsers, deleteUser, setPassword, setRole } = require('./auth');

const [, , cmd, ...args] = process.argv;

async function main() {
  await db.ready();
  if (cmd === 'add') {
    const [username, password, fullName, role, email] = args;
    if (!username || !password) throw new Error('Usage: add <username> <password> ["Full Name"] [role] [email]');
    const user = await createUser(username, password, fullName || username, role || 'editor', email || null);
    console.log(`Added user "${user.username}" (${user.role}).`);
  } else if (cmd === 'list') {
    console.table(await listUsers());
  } else if (cmd === 'remove') {
    if (!args[0]) throw new Error('Usage: remove <username>');
    await deleteUser(args[0]);
    console.log(`Removed "${args[0]}".`);
  } else if (cmd === 'password') {
    if (!args[0] || !args[1]) throw new Error('Usage: password <username> <new-password>');
    await setPassword(args[0], args[1]);
    console.log(`Password updated for "${args[0]}".`);
  } else if (cmd === 'role') {
    if (!args[0] || !args[1]) throw new Error('Usage: role <username> <admin|editor|viewer>');
    await setRole(args[0], args[1]);
    console.log(`Role updated for "${args[0]}".`);
  } else {
    console.log([
      'Usage:',
      '  node server/manage-users.js add <username> <password> ["Full Name"] [role] [email]',
      '  node server/manage-users.js list',
      '  node server/manage-users.js remove <username>',
      '  node server/manage-users.js password <username> <new-password>',
      '  node server/manage-users.js role <username> <admin|editor|viewer>',
    ].join('\n'));
  }
}

main()
  .then(() => db.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err.message || err);
    try { await db.close(); } catch (_) {}
    process.exit(1);
  });
