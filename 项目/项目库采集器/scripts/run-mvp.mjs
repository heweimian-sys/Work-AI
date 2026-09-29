import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const commands = ['collector:init', 'collector:import-pilot', 'collector:browser-sample', 'collector:export'];

for (const name of commands) {
  console.log(`\n=== ${name} ===`);
  await new Promise((done, fail) => {
    const child = spawn('npm', ['run', name], { cwd: root, stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', (code) => code === 0 ? done() : fail(new Error(`${name} 失败，退出码 ${code}`)));
  });
}
console.log('\nMVP 已完成：collector_mvp/exports/采集收件箱.csv');
