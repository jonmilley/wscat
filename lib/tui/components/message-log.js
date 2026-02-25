import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { MessageLine } from './message-line.js';

const h = React.createElement;

export function MessageLog({ messages }) {
  const { stdout } = useStdout();
  const [scrollOffset, setScrollOffset] = useState(0);

  // Reserve rows: 1 status bar + 1 separator + 1 input bar + 1 separator = 4
  const viewportHeight = Math.max(1, (stdout.rows || 24) - 4);

  const len = messages.length;

  // Auto-scroll when at bottom and new messages arrive
  useEffect(() => {
    if (scrollOffset === 0) return;
    // Don't auto-adjust — user is scrolled up
  }, [messages.length]);

  useInput((input, key) => {
    if (key.pageUp) {
      setScrollOffset((prev) => Math.min(prev + viewportHeight, Math.max(0, len - viewportHeight)));
    } else if (key.pageDown) {
      setScrollOffset((prev) => Math.max(0, prev - viewportHeight));
    }
  });

  const start = Math.max(0, len - viewportHeight - scrollOffset);
  const end = Math.max(0, len - scrollOffset);
  const visible = messages.slice(start, end);

  const newBelow = scrollOffset > 0 ? scrollOffset : 0;

  const children = visible.map((msg, i) =>
    h(MessageLine, { key: `${start + i}-${msg.id}`, message: msg })
  );

  if (newBelow > 0) {
    children.push(
      h(Text, { key: 'indicator', color: 'yellow', dimColor: true },
        `  [${newBelow} message(s) below]`)
    );
  }

  return h(Box, { flexDirection: 'column', flexGrow: 1 }, ...children);
}
