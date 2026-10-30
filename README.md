# portwho

**Which process is holding this port?**

```
> portwho 8088 8085 8084
8088  TCP LISTENING     0.0.0.0:8088             node.exe (27336)
8088  TCP LISTENING     :::8088                  node.exe (27336)
8085  TCP LISTENING     0.0.0.0:8085             node.exe (15752)
8085  TCP LISTENING     :::8085                  node.exe (15752)
8084  TCP LISTENING     0.0.0.0:8084             node.exe (11208)
8084  TCP LISTENING     :::8084                  node.exe (11208)
```

A dev server refuses to start, says `Port 8084 is being used by another process`, and stops there. `portwho` answers the question that message leaves out. It is read-only by design: it tells you the PID and the process name, and killing it stays your decision.

## Install and run

Needs Node 23.6 or newer, which runs TypeScript directly, so there is nothing to build.

```bash
npx portwho 8088
node src/index.ts 8088 --json
```

Exit codes: `0` at least one port is in use, `3` every port is free, `2` bad usage. That makes it usable in a script that waits for a port to be released:

```bash
until portwho 8081 > /dev/null; [ $? -eq 3 ]; do sleep 1; done
```

## How it works

`src/parse.ts` holds all the logic and does no I/O, so it is tested against captured output rather than against a live machine:

1. Run `netstat -ano` and read its rows. The header text is translated on a non-English Windows (`Dirección local`), so rows are recognised by shape — protocol, two endpoints, an optional state, a PID — never by column titles. UDP rows have no state column, which is the one asymmetry worth knowing about.
2. Match the requested port on either side of the connection, so a `TIME_WAIT` peer of the port is visible too, not just the listener.
3. Resolve each PID with `tasklist /FI "PID eq <pid>" /FO CSV /NH`. CSV is quoted, so process names containing commas are parsed with a real field scanner rather than a `split(',')`.

Transient kernel-owned rows report PID `0`, which has no process name; those are shown as `pid 0 (already exiting)`.

## Scope and limits

- **Windows only.** It shells out to `netstat` and `tasklist`; the POSIX equivalents (`lsof`, `ss`) are a different parser and are not implemented.
- No admin rights are needed to see your own processes. A process owned by another user shows its PID but `tasklist` may not name it.
- It reads the state of the machine at call time; nothing is cached.

## Checks

```bash
npm test        # 14 assertions over the two parsers
npm run typecheck
```

The tests cover the translated header, IPv6 brackets, UDP rows without a state column, PID-zero rows, CRLF endings, non-table output and commas inside quoted process names. CI runs both commands on Node 24.

## License

MIT — see [LICENSE](LICENSE).
