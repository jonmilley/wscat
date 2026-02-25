import readline from 'readline';
import { EventEmitter } from 'events';

export class Console extends EventEmitter {
  static Colors = Object.freeze({
    Red: '\x1b[31m',
    Green: '\x1b[32m',
    Yellow: '\x1b[33m',
    Blue: '\x1b[34m',
    Default: '\x1b[39m'
  });

  static Types = Object.freeze({
    Incoming: '< ',
    Control: '',
    Error: 'error: '
  });

  constructor() {
    super();

    this.stdin = process.stdin;
    this.stdout = process.stdout;
    this._closed = false;

    this.readlineInterface = readline.createInterface(this.stdin, this.stdout);

    this.readlineInterface
      .on('line', (data) => this.emit('line', data))
      .on('close', () => { this._closed = true; this.emit('close'); });

    this._resetInput = () => this.clear();
  }

  prompt(preserveCursor) {
    if (process.stdout.isTTY && !this._closed) {
      this.readlineInterface.prompt(preserveCursor);
    }
  }

  setPrompt(p) {
    if (!this._closed) this.readlineInterface.setPrompt(p);
  }

  print(type, msg, color) {
    if (!process.stdout.isTTY) {
      if (type === Console.Types.Incoming) {
        process.stdout.write(`${msg}\n`);
      } else if (type === Console.Types.Error) {
        process.stderr.write(`${type}${msg}\n`);
      }
      return;
    }

    this.clear();
    color = color || Console.Colors.Default;
    const prefix = type || '';
    if (this._useColor !== false) {
      this.stdout.write(`${color}${prefix}${msg}${Console.Colors.Default}\n`);
    } else {
      this.stdout.write(`${prefix}${msg}\n`);
    }
    this.prompt();
  }

  clear() {
    if (process.stdout.isTTY) {
      this.stdout.write('\x1b[2K\x1b[E');
    }
  }

  pause() {
    this.stdin.on('keypress', this._resetInput);
  }

  resume() {
    this.stdin.removeListener('keypress', this._resetInput);
  }
}

export class ReadlineUI {
  constructor(engine, opts) {
    this.engine = engine;
    this.opts = opts;
    this.console = new Console();
    this.console._useColor = opts.color;

    this._wireEngineEvents();
    this._wireConsoleEvents();
  }

  _wireEngineEvents() {
    const c = this.console;
    const C = Console;

    this.engine.on('listening', ({ port }) => {
      c.print(C.Types.Control, `listening on port ${port} (press CTRL+C to quit)`, C.Colors.Green);
      if (this.opts.parsecommands) this._printCommands();
      c.clear();
    });

    this.engine.on('client-connected', () => {
      c.resume();
      c.prompt();
      c.print(C.Types.Control, 'client connected', C.Colors.Green);
    });

    this.engine.on('connected', () => {
      c.print(C.Types.Control, 'connected (press CTRL+C to quit)', C.Colors.Green);
      c.setPrompt('> ');
      c.prompt();
    });

    this.engine.on('disconnected', ({ code, reason }) => {
      c.print(C.Types.Control, `disconnected (code: ${code}, reason: "${reason}")`, C.Colors.Green);
      this._printCounts();
      c.clear();
    });

    this.engine.on('message', ({ data }) => {
      c.print(C.Types.Incoming, data, C.Colors.Blue);
    });

    this.engine.on('sent', ({ data }) => {
      c.print(C.Types.Control, `> ${data}`);
    });

    this.engine.on('control', ({ text }) => {
      c.print(C.Types.Control, text, C.Colors.Green);
    });

    this.engine.on('error', ({ error, fatal }) => {
      c.print(C.Types.Error, error.message || error.toString(), C.Colors.Yellow);
      if (!fatal) this._printCounts();
      if (fatal) process.exit(1);
    });

    this.engine.on('print-counts', () => {
      this._printCounts();
    });

    this.engine.on('retry-exhausted', () => {
      c.setPrompt('disconnected, press return to retry or ctrl-c to quit');
      c.prompt();
    });

    this.engine.on('exit', ({ code } = {}) => {
      process.exit(code || 0);
    });
  }

  _wireConsoleEvents() {
    this.console.on('line', (data) => {
      if (this.opts.connect) {
        if (!this.engine.isOpen && this.engine.numRetries > this.engine.maxRetries) {
          this.engine.retryNow();
        }
        if (!this.engine.isOpen) return;
      }
      this.engine.parseCommand(data);
      this.console.prompt();
    });

    this.console.on('close', () => {
      if (this.opts.connect) {
        this._printCounts();
        if (!this.engine.ws) return;
        try { this.engine.close(); } catch (e) {}
        process.exit();
      } else {
        try { this.engine.close(); } catch (e) {}
        process.exit(0);
      }
    });
  }

  _printCounts() {
    const s = this.engine.stats;
    const C = Console;
    if (s.connectionStartTime) {
      const elapsed = Date.now() - s.connectionStartTime;
      this.console.print(C.Types.Control, `Connection Open for ${elapsed} ms`, C.Colors.Green);
    }
    this.console.print(C.Types.Control, `${s.messagesReceived} message(s) Received`, C.Colors.Green);
    this.console.print(C.Types.Control, `${s.messagesSent} message(s) Sent`, C.Colors.Green);
    this.console.print(C.Types.Control, `${s.pingsReceived} ping(s) Received`, C.Colors.Green);
    this.console.print(C.Types.Control, `${s.pingsSent} ping(s) Sent`, C.Colors.Green);
    this.console.print(C.Types.Control, `${s.pongsReceived} pong(s) Received`, C.Colors.Green);
    this.console.print(C.Types.Control, `${s.pongsSent} pong(s) Sent`, C.Colors.Green);
    if (s.lastMessage) {
      this.console.print(C.Types.Control, 'Last Message Received =', C.Colors.Green);
      this.console.print(C.Types.Incoming, s.lastMessage);
    }
  }

  _printCommands() {
    const C = Console;
    this.console.print(C.Types.Control, "'> send <message>' to send <message> to server", C.Colors.Green);
    this.console.print(C.Types.Control, "'> ping' to send a ping to the server", C.Colors.Green);
    this.console.print(C.Types.Control, "'> pong' to send pong to the server", C.Colors.Green);
    this.console.print(C.Types.Control, "'> close' to gracefully close connection to the server", C.Colors.Green);
    this.console.print(C.Types.Control, "'> last' to reprint last received message", C.Colors.Green);
    this.console.print(C.Types.Control, "'> counts' to print frame counts", C.Colors.Green);
  }

  startListen(port) {
    this.console.pause();
    this.engine.listenOn(port);
  }

  startConnect(passphrase) {
    if (this.opts.retry) {
      this.console.setPrompt('connecting... ');
      this.console.prompt();
    }
    this.engine.connectTo(passphrase);

    // SIGINT handler for clean shutdown
    process.on('SIGINT', () => {
      if (this.engine.ws && this.engine.ws.readyState === 1) {
        this.engine.close();
      } else {
        process.exit();
      }
    });
  }
}
