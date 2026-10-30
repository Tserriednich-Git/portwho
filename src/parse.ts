export type Connection = {
  protocol: 'TCP' | 'UDP';
  localAddress: string;
  localPort: number;
  foreignAddress: string;
  foreignPort: number;
  state: string;
  pid: number;
};

export type ProcessInfo = { name: string; pid: number };

/**
 * `netstat -ano` translates its header but never its rows, so a row is
 * recognised by shape rather than by the column titles above it. UDP rows carry
 * no state column, which is why the column count is protocol dependent.
 */
export function parseNetstat(output: string): Connection[] {
  const connections: Connection[] = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    const protocol = columns[0];
    if (protocol !== 'TCP' && protocol !== 'UDP') continue;
    if (columns.length < (protocol === 'TCP' ? 5 : 4)) continue;

    const pid = Number(columns.at(-1));
    if (!Number.isInteger(pid) || pid < 0) continue;

    const [localAddress, localPort] = splitAddress(columns[1]!);
    const [foreignAddress, foreignPort] = splitAddress(columns[2]!);
    connections.push({
      protocol,
      localAddress,
      localPort,
      foreignAddress,
      foreignPort,
      state: protocol === 'TCP' ? columns[3]! : '',
      pid,
    });
  }
  return connections;
}

/** IPv6 endpoints are bracketed, so the port is always after the last colon. */
export function splitAddress(text: string): [string, number] {
  const separator = text.lastIndexOf(':');
  if (separator === -1) return [text, Number.NaN];
  const host = text.slice(0, separator);
  const port = Number(text.slice(separator + 1));
  const address = host.startsWith('[') ? host.slice(1, -1) : host;
  return [address, Number.isFinite(port) ? port : Number.NaN];
}

export function connectionsForPort(connections: Connection[], port: number): Connection[] {
  return connections.filter((entry) => entry.localPort === port || entry.foreignPort === port);
}

/** Distinct, ascending PIDs, with the placeholder zero dropped. */
export function uniquePids(connections: Connection[]): number[] {
  return [...new Set(connections.map((entry) => entry.pid))].filter((pid) => pid > 0).sort((a, b) => a - b);
}

/**
 * `tasklist /FO CSV /NH` yields one quoted row per process, or a single
 * unquoted INFO line when nothing matches.
 */
export function parseTasklistCsv(output: string): ProcessInfo | null {
  for (const line of output.split(/\r?\n/)) {
    const fields = splitCsv(line.trim());
    if (fields.length < 2) continue;
    const pid = Number(fields[1]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    return { name: fields[0]!, pid };
  }
  return null;
}

function splitCsv(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let insideQuotes = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (character !== '"') {
      if (character === ',' && !insideQuotes) {
        fields.push(field);
        field = '';
      } else {
        field += character;
      }
      continue;
    }
    if (insideQuotes && line[index + 1] === '"') {
      field += '"';
      index++;
    } else {
      insideQuotes = !insideQuotes;
    }
  }
  fields.push(field);
  return fields;
}
