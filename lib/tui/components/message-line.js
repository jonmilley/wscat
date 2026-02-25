import React from 'react';
import { Text } from 'ink';

const h = React.createElement;

export function MessageLine({ message }) {
  const { type, text } = message;

  if (type === 'sent') {
    return h(Text, { color: 'green' }, `> ${text}`);
  }
  if (type === 'incoming') {
    return h(Text, { color: 'blue' }, `< ${text}`);
  }
  if (type === 'control') {
    return h(Text, { color: 'yellow' }, `* ${text}`);
  }
  if (type === 'error') {
    return h(Text, { color: 'red' }, `error: ${text}`);
  }
  return h(Text, null, text);
}
