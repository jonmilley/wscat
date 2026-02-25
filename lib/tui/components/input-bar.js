import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

const h = React.createElement;

export function InputBar({ onSubmit }) {
  const [value, setValue] = useState('');

  const handleSubmit = (val) => {
    if (val.trim()) {
      onSubmit(val);
    }
    setValue('');
  };

  return h(Box, { flexDirection: 'row', paddingLeft: 1 },
    h(Text, { color: 'green', bold: true }, '> '),
    h(TextInput, { value, onChange: setValue, onSubmit: handleSubmit })
  );
}
