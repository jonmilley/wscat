import React, { useState, useEffect, useRef } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { StatusBar } from './components/status-bar.js';
import { MessageLog } from './components/message-log.js';
import { InputBar } from './components/input-bar.js';

const h = React.createElement;

let msgIdCounter = 0;

function App({ engine, opts, passphrase }) {
  const { exit } = useApp();
  const [messages, setMessages] = useState([]);
  const [connectionState, setConnectionState] = useState(
    opts.listen ? 'listening' : 'connecting'
  );
  const [stats, setStats] = useState({ ...engine.stats });
  const [elapsedTime, setElapsedTime] = useState(null);
  const engineRef = useRef(engine);

  // Subscribe to engine events
  useEffect(() => {
    const eng = engineRef.current;

    const addMessage = (type, text) => {
      setMessages((prev) => [...prev, { id: ++msgIdCounter, type, text }]);
    };

    const onListening = ({ port }) => {
      setConnectionState('waiting-for-client');
      addMessage('control', `listening on port ${port}`);
    };

    const onClientConnected = () => {
      setConnectionState('connected');
      addMessage('control', 'client connected');
      setStats({ ...eng.stats });
    };

    const onConnected = () => {
      setConnectionState('connected');
      addMessage('control', 'connected');
      eng.resetStats();
      setStats({ ...eng.stats });
    };

    const onDisconnected = ({ code, reason }) => {
      setConnectionState('disconnected');
      addMessage('control', `disconnected (code: ${code}, reason: "${reason}")`);

      setElapsedTime(null);
      eng.stats.connectionStartTime = null;
      setStats({ ...eng.stats });

    };

    const onMessage = ({ data }) => {
      addMessage('incoming', data);
      setStats({ ...eng.stats });
    };

    const onSent = ({ data }) => {
      addMessage('sent', data);
      setStats({ ...eng.stats });
    };

    const onControl = ({ text }) => {
      addMessage('control', text);
    };

    const onError = ({ error }) => {
      addMessage('error', error.message || error.toString());
    };

    const onStatsUpdated = () => {
      setStats({ ...eng.stats });
    };

    const onRetry = ({ attempt, max }) => {
      setConnectionState('connecting');
      addMessage('control', `retrying (${attempt}/${max})...`);
    };

    const onRetryExhausted = () => {
      addMessage('control', 'retry limit reached, press Ctrl+C to quit');
    };

    const onPrintCommands = () => {
      addMessage('control', "'send <message>' to send <message> to server");
      addMessage('control', "'ping' to send a ping to the server");
      addMessage('control', "'pong' to send pong to the server");
      addMessage('control', "'close' to gracefully close connection to the server");
      addMessage('control', "'last' to reprint last received message");
      addMessage('control', "'counts' to print frame counts");
      addMessage('control', "'?' or 'help' to show this help");
    };

    const onPrintCounts = () => {
      const s = eng.stats;
      if (s.connectionStartTime) {
        const elapsed = Date.now() - s.connectionStartTime;
        addMessage('control', `Connection Open for ${elapsed} ms`);
      }
      addMessage('control', `${s.messagesReceived} message(s) Received`);
      addMessage('control', `${s.messagesSent} message(s) Sent`);
      addMessage('control', `${s.pingsReceived} ping(s) Received`);
      addMessage('control', `${s.pingsSent} ping(s) Sent`);
      addMessage('control', `${s.pongsReceived} pong(s) Received`);
      addMessage('control', `${s.pongsSent} pong(s) Sent`);
      if (s.lastMessage) {
        addMessage('control', 'Last Message Received =');
        addMessage('incoming', s.lastMessage);
      }
    };

    const onExit = () => {
      exit();
    };

    eng.on('listening', onListening);
    eng.on('client-connected', onClientConnected);
    eng.on('connected', onConnected);
    eng.on('disconnected', onDisconnected);
    eng.on('message', onMessage);
    eng.on('sent', onSent);
    eng.on('control', onControl);
    eng.on('error', onError);
    eng.on('stats-updated', onStatsUpdated);
    eng.on('retry', onRetry);
    eng.on('retry-exhausted', onRetryExhausted);
    eng.on('print-counts', onPrintCounts);
    eng.on('print-commands', onPrintCommands);
    eng.on('exit', onExit);

    return () => {
      eng.removeListener('listening', onListening);
      eng.removeListener('client-connected', onClientConnected);
      eng.removeListener('connected', onConnected);
      eng.removeListener('disconnected', onDisconnected);
      eng.removeListener('message', onMessage);
      eng.removeListener('sent', onSent);
      eng.removeListener('control', onControl);
      eng.removeListener('error', onError);
      eng.removeListener('stats-updated', onStatsUpdated);
      eng.removeListener('retry', onRetry);
      eng.removeListener('retry-exhausted', onRetryExhausted);
      eng.removeListener('print-counts', onPrintCounts);
      eng.removeListener('print-commands', onPrintCommands);
      eng.removeListener('exit', onExit);
    };
  }, []);

  // Elapsed time ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const eng = engineRef.current;
      if (eng.stats.connectionStartTime) {
        setElapsedTime(Date.now() - eng.stats.connectionStartTime);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Start engine
  useEffect(() => {
    const eng = engineRef.current;
    if (opts.listen) {
      eng.listenOn(opts.listenPort);
    } else {
      eng.connectTo(passphrase);
    }
  }, []);

  // Ctrl+C handler
  useInput((input, key) => {
    if (input === 'c' && key.ctrl) {
      engineRef.current.close();
      exit();
      setTimeout(() => process.exit(0), 100);
    }
  });

  const handleSubmit = (value) => {
    const eng = engineRef.current;
    if (!eng.isOpen) return;
    eng.parseCommand(value);
    // If not in parsecommands mode, show sent message in log
    if (!opts.parsecommands && !(opts.slash && value.startsWith('/'))) {
      setMessages((prev) => [...prev, { id: ++msgIdCounter, type: 'sent', text: value }]);
    }
  };

  const url = opts.connect ? opts.connectUrl : `listening on port ${opts.listenPort}`;

  return h(Box, { flexDirection: 'column', height: '100%' },
    h(StatusBar, { connectionState, url, elapsedTime, stats }),
    h(Box, { borderStyle: 'single', borderTop: false, borderLeft: false, borderRight: false, borderBottom: true },
      h(Text, { dimColor: true }, '')
    ),
    h(MessageLog, { messages }),
    h(Box, { borderStyle: 'single', borderTop: true, borderLeft: false, borderRight: false, borderBottom: false },
      h(Text, { dimColor: true }, '')
    ),
    h(InputBar, { onSubmit: handleSubmit })
  );
}

export function startTui(engine, opts, passphrase) {
  // Enter alternate screen buffer
  process.stdout.write('\x1b[?1049h');

  const { unmount, waitUntilExit } = render(
    h(App, { engine, opts, passphrase }),
    { exitOnCtrlC: false }
  );

  waitUntilExit().then(() => {
    // Restore main screen buffer
    process.stdout.write('\x1b[?1049l');

    // Print session counts to the restored terminal
    const s = engine.stats;
    if (s.connectionStartTime) {
      const elapsed = Date.now() - s.connectionStartTime;
      process.stdout.write(`Connection Open for ${elapsed} ms\n`);
    }
    process.stdout.write(`${s.messagesReceived} message(s) Received\n`);
    process.stdout.write(`${s.messagesSent} message(s) Sent\n`);
    process.stdout.write(`${s.pingsReceived} ping(s) Received\n`);
    process.stdout.write(`${s.pingsSent} ping(s) Sent\n`);
    process.stdout.write(`${s.pongsReceived} pong(s) Received\n`);
    process.stdout.write(`${s.pongsSent} pong(s) Sent\n`);
    if (s.lastMessage) {
      process.stdout.write(`Last Message Received = ${s.lastMessage}\n`);
    }

    process.exit(0);
  });
}
