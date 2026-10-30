import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const windowsOnly = process.platform === 'win32' ? false : 'portwho resolves processes through netstat and tasklist';

type Report = { port: number; processes: { pid: number; name: string }[] };

const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

const listen = async (): Promise<number> => {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
};

test('names this very process when it holds the port', { skip: windowsOnly }, async () => {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;

  const result = run(String(port), '--json');
  server.close();

  assert.equal(result.status, 0, result.stderr);
  const [report] = JSON.parse(result.stdout) as Report[];
  const owners = report?.processes.map((entry) => entry.pid) ?? [];
  assert.ok(owners.includes(process.pid), `expected pid ${process.pid} in ${JSON.stringify(owners)}`);
});

test('reports a port nobody holds as free', { skip: windowsOnly }, async () => {
  const port = await listen();
  const result = run(String(port));
  assert.equal(result.status, 3, `port ${port} was reported busy: ${result.stdout}`);
  assert.match(result.stdout, /free/);
});

test('refuses arguments that are not ports', { skip: windowsOnly }, () => {
  assert.equal(run('abc').status, 2);
  assert.equal(run('70000').status, 2);
  assert.equal(run('--nope', '8080').status, 2);
  assert.match(run('--nope', '8080').stderr, /Unknown option: --nope/);
});

test('prints its own version', () => {
  const result = run('--version');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^portwho \d+\.\d+\.\d+/);
});

test('shows usage without arguments', () => {
  const result = run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /which process holds a TCP or UDP port/);
});
