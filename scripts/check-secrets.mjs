import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const pattern = /\b(?:[sr]k_(?:live|test)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,})\b/;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const failures = [];
function inspect(label, contents) {
  let unsafe = pattern.test(contents);
  for (const token of contents.matchAll(jwtPattern)) {
    try {
      if (JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url')).role === 'service_role') unsafe = true;
    } catch { /* Non-token text has no authority. */ }
  }
  if (unsafe) failures.push(label);
}
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of new Set(files)) {
  try { inspect(file, readFileSync(file, 'utf8')); } catch { /* Deleted files and directories have no source content. */ }
}
function inspectDirectory(directory) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, file.name);
    if (file.isDirectory()) inspectDirectory(location);
    else if (/\.(?:js|mjs|css|html|json|map)$/.test(file.name)) inspect(location, readFileSync(location, 'utf8'));
  }
}
if (process.argv.includes('--dist')) inspectDirectory('dist');
if (process.argv.includes('--history')) {
  const commits = execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8' }).trim().split('\n');
  for (const commit of commits) {
    let output = '';
    try {
      output = execFileSync('git', ['grep', '-I', '-n', '-E',
        '([sr]k_(live|test)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)', commit],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      if (error.status !== 1) throw new Error('Could not complete the history scan.');
    }
    for (const line of output.split('\n').filter(Boolean)) {
      const match = line.match(/^([^:]+):([^:]+):(\d+):(.*)$/);
      if (match) inspect(`${match[1].slice(0, 8)}:${match[2]}:${match[3]}`, match[4]);
    }
  }
}
if (failures.length) {
  console.error('Potential private credentials detected. Values are redacted. Review:');
  console.error([...new Set(failures)].join('\n'));
  process.exitCode = 1;
} else console.log('Secret scan passed. No private credentials found in the checked files.');
