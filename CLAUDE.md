# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`wscat2` is a maintained fork of the `wscat` WebSocket CLI tool. It allows connecting to or hosting a WebSocket server from the command line.

## Commands

Install dependencies:
```
npm install
```

Install globally for local development:
```
npm link
```

Run directly without installing:
```
node bin/wscat --help
node bin/wscat -c wss://echo.websocket.org
node bin/wscat -l 8080
```

There is no build step, lint configuration, or test suite in this project.

## Architecture

The entire application lives in a single file: `bin/wscat`.

**`Console` class** (`bin/wscat:102`): Wraps Node's `readline` to provide interactive I/O with ANSI color support. Emits `line` and `close` events. `Console.Colors` holds ANSI escape codes used throughout.

**`parseInput(data)`** (`bin/wscat:55`): Handles user input. In `--parsecommands` mode, treats lines as commands (`send`, `ping`, `pong`, `close`, `last`, `counts`). Otherwise sends input directly as a WebSocket message.

**Two operating modes** (bottom of file):
- **Listen mode** (`--listen <port>`): Creates a `WebSocket.Server`. Accepts only one client at a time; additional connections are immediately terminated.
- **Connect mode** (`--connect <url>`): Creates a `WebSocket` client. Retry logic (`--retry`) attempts up to 4 automatic reconnects at 500ms intervals before prompting the user to press Enter to retry.

**Global counters** (`bin/wscat:23`): `messagesSent`, `messagesReceived`, `pingsSent`, `pingsReceived`, `pongsSent`, `pongsReceived`, `lastMessage` — tracked throughout the session and printed by `printCounts()` on close or via the `counts` command.

**Keepalive** (`--keepalive <interval>`): Uses `setInterval` to send pings at the specified millisecond interval. The interval is cleared on disconnect.

**Dependencies**: `commander` for CLI option parsing, `ws` for WebSocket client/server, `tinycolor` (listed in package.json but unused in code), and Node built-ins `readline`, `events`, `util`, `fs`.
