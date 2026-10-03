#!/usr/bin/env node
// Make and manage invite codes for friends. Talks to the running server, so it works against
// production or a local server. Needs ADMIN_API_KEY (the same value the server has).
//
//   ADMIN_API_KEY=... APP_URL=https://ace-interview.app node scripts/invite.js create friend@example.com 10 14
//   node scripts/invite.js list
//   node scripts/invite.js revoke ACE-ABCD-EFGH
//
// create takes: email, number of questions (default 10), days the code stays valid (default 14).
const APP_URL = (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
const KEY = process.env.ADMIN_API_KEY;

const usage = () => {
  console.error('Usage:\n  node scripts/invite.js create <email> [questions] [days]\n  node scripts/invite.js list\n  node scripts/invite.js revoke <code>\n\nSet ADMIN_API_KEY, and APP_URL if the server is not on http://localhost:3001.');
  process.exit(1);
};

const request = async (method, path, body) => {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Failed (${res.status}): ${data.error || 'unknown error'}`);
    process.exit(1);
  }
  return data;
};

const printBudget = (b) => console.log(`Budget: ${b.committed} of ${b.limit} questions handed out, ${b.remaining} left.`);

(async () => {
  const [command, ...args] = process.argv.slice(2);
  if (!KEY) { console.error('ADMIN_API_KEY is not set.'); usage(); }

  if (command === 'create') {
    const [email, questions, days] = args;
    if (!email) usage();
    const body = { email };
    if (questions) body.questions = Number(questions);
    if (days) body.days = Number(days);
    const invite = await request('POST', '/api/admin/invites', body);
    console.log(`\nCode:     ${invite.code}`);
    console.log(`For:      ${invite.email}`);
    console.log(`Gives:    ${invite.questions} bonus questions`);
    console.log(`Expires:  ${invite.expiresAt}`);
    console.log(`Link:     ${APP_URL}/?code=${invite.code}\n`);
    console.log(`Message you can send:\n  Here is a code for ${invite.questions} extra practice questions on ACE: ${invite.code}\n  Open ${APP_URL}/?code=${invite.code} and sign in with Google using ${invite.email}.\n`);
    printBudget(invite.budget);
  } else if (command === 'list') {
    const { invites, budget } = await request('GET', '/api/admin/invites');
    if (invites.length === 0) console.log('No codes yet.');
    for (const i of invites) console.log(`${i.code}  ${i.status.padEnd(8)}  ${String(i.questions).padStart(3)} questions  ${i.email}  (expires ${i.expiresAt.slice(0, 10)})`);
    printBudget(budget);
  } else if (command === 'revoke') {
    if (!args[0]) usage();
    const result = await request('DELETE', `/api/admin/invites/${encodeURIComponent(args[0])}`);
    console.log(`Revoked ${result.code}.`);
    printBudget(result.budget);
  } else {
    usage();
  }
})();
