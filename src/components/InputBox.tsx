import React, { useState, useRef, useEffect } from 'react';
import { Text, Box, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';

interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  mode?: 'chat' | 'command' | 'file';
  history?: string[];
  error?: string;
  disabled?: boolean;
}

export const InputBox: React.FC<InputBoxProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = 'Type a message...',
  mode = 'chat',
  history = [],
  error,
  disabled = false,
}) => {
  const { write } = useStdout();
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showError, setShowError] = useState(false);
  const textareaRef = useRef<TextInput>(null);

  useInput((input, key) => {
    if (disabled) return;

    if (key.return && !key.shift) {
      if (value.trim()) {
        onSubmit(value);
        setHistoryIndex(-1);
      }
      return;
    }

    if (key.escape) {
      if (onCancel) onCancel();
      else onChange('');
      setHistoryIndex(-1);
      return;
    }

    if (key.upArrow && history.length > 0) {
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      onChange(history[newIndex]);
      return;
    }

    if (key.downArrow && history.length > 0 && historyIndex !== -1) {
      const newIndex = historyIndex === history.length - 1 ? -1 : historyIndex + 1;
      setHistoryIndex(newIndex);
      onChange(newIndex === -1 ? '' : history[newIndex]);
      return;
    }

    if (key.tab && mode === 'chat') {
      // Tab is handled by parent for agent switching
      return;
    }
  });

  if (error && !showError) {
    setShowError(true);
    setTimeout(() => setShowError(false), 3000);
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={error ? 'red' : 'gray'} paddingX={1} paddingY={1}>
      {mode === 'command' && <Text color="yellow">! </Text>}
      {mode === 'file' && <Text color="cyan">@ </Text>}
      <TextInput
        ref={textareaRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        placeholderColor="gray"
        multiline={mode !== 'command'}
      />
      {error && showError && (
        <Text color="red" marginTop={1}>✕ {error}</Text>
      )}
    </Box>
  );
};