#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  connectionsForPort,
  parseNetstat,
  parseTasklistCsv,
  uniquePids,
  type Connection,
  type ProcessInfo,
} from './parse.ts';

const USAGE = `portwho — which process holds a TCP or UDP port

  portwho <port> [<port>...]     report the owner of one or more ports
  portwho <port> --json          machine-readable output

It only ever reads. Killing the owner stays a decision you make yourself.
Exit codes: 0 a match was found, 3 the port is free, 2 bad usage.`;

type PortReport = { port: number; connections: Connection[]; processes: ProcessInfo[] };

function commandOutput(file: string, args: string[]): string {
  return execFileSync(file, args, { encoding: 'utf8', windowsHide: true });
}

function readProcesses(pids: number[]): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  for (const pid of pids) {
    const info = parseTasklistCsv(commandOutput('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']));
    if (info) processes.push(info);
  }
  return processes;
}

function buildReport(port: number, connections: Connection[]): PortReport {
  const matches = connectionsForPort(connections, port);
  return { port, connections: matches, processes: readProcesses(uniquePids(matches)) };
}

function describe(report: PortReport): string {
  if (report.connections.length === 0) return `${pad(report.port)}  free`;
  const names = report.processes.map((process) => `${process.name} (${process.pid})`).join(', ');
  return report.connections
    .map((connection) =>
      [
        pad(connection.localPort),
        pad(connection.protocol, 3),
        pad(connection.state || '-', 13),
        pad(`${connection.localAddress}:${connection.localPort}`, 24),
        names || `pid ${connection.pid} (already exiting)`,
      ].join(' '),
    )
    .join('\n');
}

function pad(text: string | number, width = 5): string {
  return String(text).padEnd(width);
}

function readVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return manifest.version;
}

function main(argv: string[]): number {
  const flags = new Set(argv.filter((argument) => argument.startsWith('--')));
  const unknown = [...flags].filter((flag) => flag !== '--json' && flag !== '--help' && flag !== '--version');
  const positional = argv.filter((argument) => !argument.startsWith('--'));
  const ports = positional.map(Number).filter((value) => Number.isInteger(value) && value > 0 && value < 65536);

  if (flags.has('--version')) {
    console.log(`portwho ${readVersion()}`);
    return 0;
  }
  if (flags.has('--help')) {
    console.log(USAGE);
    return 0;
  }

  const rejected = positional.length - ports.length;
  if (unknown.length > 0 || rejected > 0 || ports.length === 0) {
    for (const flag of unknown) console.error(`Unknown option: ${flag}`);
    if (rejected > 0) console.error(`Expected a port number between 1 and 65535.`);
    console.error(USAGE);
    return 2;
  }
  if (process.platform !== 'win32') {
    console.error('portwho reads netstat and tasklist, which only exist on Windows.');
    return 2;
  }

  const connections = parseNetstat(commandOutput('netstat', ['-ano']));
  const reports = ports.map((port) => buildReport(port, connections));

  if (flags.has('--json')) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const report of reports) console.log(describe(report));
  }

  return reports.some((report) => report.connections.length > 0) ? 0 : 3;
}

process.exitCode = main(process.argv.slice(2));
