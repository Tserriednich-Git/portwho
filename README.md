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

A dev server refuses to start, says `Port 8084 is being used by another process`, and stops there. `portwho` answers the question that message leaves out. It is read-only by design: it names the PID and the process, and killing it stays your decision.

## Run it

Needs Node 18 or newer and Windows — it reads `netstat` and `tasklist`.

```bash
npm install -g portwho-cli
portwho 8088
portwho 8088 --json
portwho --version
```

`npx portwho-cli 8088` runs it without installing. The npm package is named `portwho-cli` because an unrelated `portwho` already holds that name on the registry; the command it installs is still `portwho`.

From a clone, `npm test` builds `dist/` first. To run the sources directly, Node 23.6+ strips the types for you:

```bash
node src/index.ts 8088
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

- **Windows only.** It shells out to `netstat` and `tasklist`; the POSIX equivalents (`lsof`, `ss`) are a different parser and are not implemented. `package.json` declares `"os": ["win32"]` so a package manager can refuse it elsewhere.
- No admin rights are needed to see your own processes. A process owned by another user shows its PID but `tasklist` may not name it.
- It reads the state of the machine at call time; nothing is cached.

## Checks

```bash
npm run typecheck
npm run build      # src/*.ts -> dist/*.js
npm test           # 19 assertions, against dist/index.js
npm pack --dry-run
```

Fourteen are pure parser assertions over captured `netstat` and `tasklist` output: the translated header, IPv6 brackets, UDP rows without a state column, PID-zero rows, CRLF endings, non-table output and commas inside quoted process names. The other five run the real CLI as a child process — including one that opens a socket and then requires `portwho` to report the PID that owns it, which only holds on Windows, so CI runs on `windows-latest`. Because the tests drive `dist/index.js`, they exercise the exact file the registry serves.


## License

MIT — see [LICENSE](LICENSE).
