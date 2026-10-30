import assert from 'node:assert/strict';
import { test } from 'node:test';

import { connectionsForPort, parseNetstat, parseTasklistCsv, splitAddress, uniquePids } from '../src/parse.ts';

// Captured from a Spanish-locale `netstat -ano`: the header is translated but
// the rows are not, which is what the parser relies on.
const NETSTAT = [
  'Actividad de red:',
  '',
  '  Proto  Dirección local         Dirección remota       Estado         PID',
  '',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1432',
  '  TCP    0.0.0.0:8088           0.0.0.0:0              LISTENING       30032',
  '  TCP    127.0.0.1:61196        127.0.0.1:8088         TIME_WAIT       0',
  '  TCP    [::]:8088              [::]:0                 LISTENING       30032',
  '  UDP    0.0.0.0:5353           *:*                                    4704',
  '',
].join('\n');

test('reads every TCP and UDP row and ignores the translated header', () => {
  assert.equal(parseNetstat(NETSTAT).length, 5);
});

test('parses a listening IPv4 row', () => {
  const [, second] = parseNetstat(NETSTAT);
  assert.equal(second?.localAddress, '0.0.0.0');
  assert.equal(second?.localPort, 8088);
  assert.equal(second?.state, 'LISTENING');
  assert.equal(second?.pid, 30032);
});

test('strips the brackets off an IPv6 endpoint', () => {
  const row = parseNetstat(NETSTAT).find((entry) => entry.localAddress === '::');
  assert.equal(row?.localPort, 8088);
});

test('accepts UDP rows, which have no state column', () => {
  const udp = parseNetstat(NETSTAT).find((entry) => entry.protocol === 'UDP');
  assert.equal(udp?.state, '');
  assert.equal(udp?.pid, 4704);
});

test('keeps transient rows whose pid is zero', () => {
  const row = parseNetstat(NETSTAT).find((entry) => entry.state === 'TIME_WAIT');
  assert.equal(row?.pid, 0);
});

test('matches a port on either side of a connection', () => {
  const matches = connectionsForPort(parseNetstat(NETSTAT), 8088);
  assert.equal(matches.length, 3);
});

test('returns nothing for a free port', () => {
  assert.deepEqual(connectionsForPort(parseNetstat(NETSTAT), 8084), []);
});

test('lists distinct ascending pids without the zero placeholder', () => {
  assert.deepEqual(uniquePids(parseNetstat(NETSTAT)), [1432, 4704, 30032]);
});

test('splits addresses that carry no numeric port', () => {
  assert.deepEqual(splitAddress('*:*'), ['*', Number.NaN]);
  assert.deepEqual(splitAddress('0.0.0.0:0'), ['0.0.0.0', 0]);
  assert.deepEqual(splitAddress('[::]:443'), ['::', 443]);
});

test('tolerates CRLF line endings', () => {
  assert.equal(parseNetstat(NETSTAT.replaceAll('\n', '\r\n')).length, 5);
});

test('returns nothing for output that is not a table', () => {
  assert.deepEqual(parseNetstat('no se encontró la información'), []);
  assert.deepEqual(parseNetstat(''), []);
});

test('reads a tasklist CSV row', () => {
  assert.deepEqual(parseTasklistCsv('"node.exe","30032","Console","1","698.032 KB"'), {
    name: 'node.exe',
    pid: 30032,
  });
});

test('returns null when tasklist found no match', () => {
  assert.equal(parseTasklistCsv('INFO: No tasks are running which match the specified criteria.'), null);
  assert.equal(parseTasklistCsv('No hay tareas en ejecución.'), null);
  assert.equal(parseTasklistCsv(''), null);
});

test('keeps commas that belong inside a quoted process name', () => {
  const info = parseTasklistCsv('"chrome, beta.exe","12","Console","1","1 KB"');
  assert.equal(info?.name, 'chrome, beta.exe');
  assert.equal(info?.pid, 12);
});
