import React from 'react';
import { Box, Text } from 'ink';

const h = React.createElement;

function formatElapsed(ms) {
  if (ms == null) return '--:--';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function StatusBar({ connectionState, url, elapsedTime, stats }) {
  const stateColors = {
    connected: 'green',
    connecting: 'yellow',
    disconnected: 'red',
    listening: 'cyan',
    'waiting-for-client': 'yellow'
  };

  const stateColor = stateColors[connectionState] || 'white';
  const stateLabel = connectionState.toUpperCase();

  return h(Box, { flexDirection: 'row', width: '100%', paddingLeft: 1, paddingRight: 1 },
    h(Text, { color: stateColor, bold: true }, `[${stateLabel}]`),
    h(Text, null, ' '),
    h(Text, { dimColor: true }, url || ''),
    h(Text, null, ' | '),
    h(Text, null, formatElapsed(elapsedTime)),
    h(Text, null, ' | '),
    h(Text, null, `Msgs: ${stats.messagesSent} s / ${stats.messagesReceived} r `),
    h(Text, null, ' | '),
    h(Text, { dimColor: true }, `Ping: ${stats.pingsSent} s / ${stats.pingsReceived} r Pong: ${stats.pongsSent} s / ${stats.pongsReceived} r `)
  );
}
