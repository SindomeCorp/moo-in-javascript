import {mkdir, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

await mkdir('coverage', {recursive:true});
const tests=(await readdir('tests')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
const result=spawnSync(process.execPath,[
  '--experimental-test-coverage',
  '--test-coverage-include=dist/**/*.js',
  '--test-coverage-exclude=dist/browser/**',
  '--test-coverage-exclude=dist/worker/browser.js',
  '--test-coverage-lines=95', '--test-coverage-branches=90', '--test-coverage-functions=95',
  '--test-reporter=spec','--test-reporter-destination=stdout',
  '--test-reporter=lcov','--test-reporter-destination=coverage/lcov.info',
  '--test',...tests,
],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
