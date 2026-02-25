import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import fs from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';

function splitOnce(str, sep) {
  const i = str.indexOf(sep);
  return i === -1 ? [str, ''] : [str.slice(0, i), str.slice(i + 1)];
}

export class WsEngine extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts;
    this.ws = null;
    this.wss = null;
    this.interval = null;
    this.retryTimer = null;
    this.numRetries = 0;
    this.maxRetries = 4;
    this.cachedPassphrase = null;
    this.isOpen = false;

    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      pingsSent: 0,
      pingsReceived: 0,
      pongsSent: 0,
      pongsReceived: 0,
      lastMessage: null,
      connectionStartTime: null
    };
  }

  resetStats() {
    this.stats.messagesSent = 0;
    this.stats.messagesReceived = 0;
    this.stats.pingsSent = 0;
    this.stats.pingsReceived = 0;
    this.stats.pongsSent = 0;
    this.stats.pongsReceived = 0;
    this.stats.lastMessage = null;
    this.stats.connectionStartTime = null;
  }

  buildOptions(passphrase) {
    const opts = this.opts;
    const options = {};
    if (opts.protocol) options.protocolVersion = opts.protocol;
    if (opts.origin) options.origin = opts.origin;
    if (opts.subprotocol && opts.subprotocol.length) options.protocol = opts.subprotocol;
    if (opts.host) options.host = opts.host;
    if (!opts.check) options.rejectUnauthorized = false;
    if (opts.ca) options.ca = fs.readFileSync(opts.ca);
    if (opts.cert) options.cert = fs.readFileSync(opts.cert);
    if (opts.key) options.key = fs.readFileSync(opts.key);
    if (passphrase) options.passphrase = passphrase;
    if (opts.location) options.followRedirects = true;
    if (opts.maxRedirects) options.maxRedirects = opts.maxRedirects;
    if (opts.proxy) options.agent = new HttpsProxyAgent(opts.proxy);

    const headers = {};
    (opts.header || []).forEach((h) => {
      const [key, val] = splitOnce(h, ':');
      headers[key] = val;
    });

    if (opts.auth) {
      headers['Authorization'] = `Basic ${Buffer.from(opts.auth).toString('base64')}`;
    }

    options.headers = headers;
    return options;
  }

  buildListenOptions() {
    const opts = this.opts;
    const options = {};
    if (opts.protocol) options.protocolVersion = opts.protocol;
    if (opts.origin) options.origin = opts.origin;
    if (opts.subprotocol && opts.subprotocol.length) options.protocol = opts.subprotocol.join(', ');
    if (!opts.check) options.rejectUnauthorized = false;
    return options;
  }

  startKeepalive() {
    this.interval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
        this.stats.pingsSent++;
        this.emit('control', { text: 'ping sent' });
      }
    }, this.opts.keepalive);
  }

  stopKeepalive() {
    if (this.interval != null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  wireSocketEvents(socket, onClose) {
    socket.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : '';
      this.emit('disconnected', { code, reason: reasonStr });
      this.stopKeepalive();
      onClose(code, reasonStr);
    }).on('message', (data) => {
      this.stats.messagesReceived++;
      this.stats.lastMessage = data.toString();
      this.emit('message', { data: this.stats.lastMessage });
      this.emit('stats-updated');
    }).on('pong', () => {
      this.stats.pongsReceived++;
      if (this.opts.showPingPong) this.emit('control', { text: 'pong received' });
      this.emit('stats-updated');
    }).on('ping', () => {
      this.stats.pingsReceived++;
      this.stats.pongsSent++;
      if (this.opts.showPingPong) this.emit('control', { text: 'pong sent (auto-reply)' });
      this.emit('stats-updated');
    });
  }

  listenOn(port) {
    this.wss = new WebSocketServer({ port }, () => {
      this.emit('listening', { port });
    });

    this.wss.on('connection', (newClient) => {
      if (this.ws) return newClient.terminate();

      this.ws = newClient;
      this.resetStats();
      this.stats.connectionStartTime = Date.now();
      this.isOpen = true;
      this.emit('client-connected');

      if (this.opts.keepalive) this.startKeepalive();

      this.wireSocketEvents(this.ws, () => {
        this.isOpen = false;
        this.ws = null;
      });

      this.ws.on('error', (err) => {
        this.emit('error', { error: err });
      });
    }).on('error', (err) => {
      this.emit('error', { error: err, fatal: true });
    });
  }

  connectTo(passphrase) {
    if (this.ws) return;

    this.cachedPassphrase = passphrase;

    if (this.opts.retry) {
      this.emit('control', { text: 'connecting...' });
    }

    this.ws = new WebSocket(this.opts.connectUrl, this.buildOptions(passphrase));

    this.ws.on('open', () => {
      this.stats.connectionStartTime = Date.now();
      this.isOpen = true;
      this.numRetries = 0;

      if (this.opts.keepalive) this.startKeepalive();

      this.emit('connected');

      // --message: send then stay interactive
      (this.opts.message || []).forEach((msg) => {
        this.ws.send(msg);
        this.stats.messagesSent++;
        this.emit('sent', { data: msg });
        this.emit('stats-updated');
      });

      // --execute: send then close after --wait seconds
      if (this.opts.execute && this.opts.execute.length > 0) {
        this.opts.execute.forEach((msg) => {
          this.ws.send(msg);
          this.stats.messagesSent++;
          this.emit('sent', { data: msg });
          this.emit('stats-updated');
        });
        if (this.opts.wait >= 0) setTimeout(() => this.ws.close(), this.opts.wait * 1000);
      }
    });

    this.wireSocketEvents(this.ws, () => {
      this.isOpen = false;
      this.ws = null;
      if (this.opts.retry) {
        this.retry();
      } else {
        this.emit('exit');
      }
    });

    this.ws.on('error', (err) => {
      if (this.numRetries === 0) {
        this.emit('error', { error: err });
      }
      this.ws = null;
      if (this.opts.retry) {
        this.retry();
      } else {
        this.emit('exit', { code: 1 });
      }
    });
  }

  retry() {
    if (this.retryTimer) return;
    if (++this.numRetries > this.maxRetries) {
      this.emit('retry-exhausted');
    } else {
      this.emit('retry', { attempt: this.numRetries, max: this.maxRetries });
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.connectTo(this.cachedPassphrase);
      }, 500);
    }
  }

  retryNow() {
    this.numRetries = 0;
    this.connectTo(this.cachedPassphrase);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      this.stats.messagesSent++;
      this.emit('stats-updated');
    }
  }

  sendPing(payload) {
    if (this.ws) {
      this.ws.ping(payload || undefined);
      this.stats.pingsSent++;
      this.emit('control', { text: 'ping sent' });
      this.emit('stats-updated');
    }
  }

  sendPong(payload) {
    if (this.ws) {
      this.ws.pong(payload || undefined);
      this.stats.pongsSent++;
      this.emit('control', { text: 'pong sent' });
      this.emit('stats-updated');
    }
  }

  close(code, reason) {
    if (this.ws) {
      this.ws.close(code || 1000, reason || '');
    }
  }

  handleSlashCommand(data) {
    if (data.startsWith('/ping')) {
      const payload = data.slice('/ping'.length).trim();
      this.sendPing(payload || undefined);
    } else if (data.startsWith('/pong')) {
      const payload = data.slice('/pong'.length).trim();
      this.sendPong(payload || undefined);
    } else if (data.startsWith('/close')) {
      const parts = data.slice('/close'.length).trim().split(/\s+/);
      const code = parts[0] ? parseInt(parts[0], 10) : 1000;
      const reason = parts.slice(1).join(' ') || '';
      this.close(code, reason);
    } else {
      this.emit('error', { error: new Error(`Unknown slash command: ${data}`) });
    }
  }

  parseCommand(data) {
    if (this.opts.parsecommands) {
      if (data.startsWith('send ')) {
        const msg = data.slice('send '.length);
        this.send(msg);
        this.emit('control', { text: `sent (${msg})` });
      } else if (data === 'ping' || data.startsWith('ping ')) {
        this.sendPing();
      } else if (data === 'pong' || data.startsWith('pong ')) {
        this.sendPong();
      } else if (data === 'close' || data.startsWith('close ')) {
        this.close(1001, 'Client Closing.');
        this.emit('control', { text: 'Connection Closed' });
      } else if (data === 'last') {
        if (this.stats.lastMessage) {
          this.emit('control', { text: 'Last Message Received =' });
          this.emit('message', { data: this.stats.lastMessage, replay: true });
        }
      } else if (data === 'counts') {
        this.emit('print-counts');
      } else if (this.opts.slash && data.startsWith('/')) {
        this.handleSlashCommand(data);
      }
    } else if (this.opts.slash && data.startsWith('/')) {
      this.handleSlashCommand(data);
    } else {
      this.send(data);
    }
  }
}
