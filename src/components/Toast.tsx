import React, { useEffect, useState } from 'react';
import { Text, Box, useInput } from 'ink';

interface ToastProps {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  onDismiss: () => void;
  action?: { label: string; onClick: () => void };
}

const toastStyles = {
  info: { bg: 'cyan', fg: 'black', icon: 'ℹ' },
  success: { bg: 'green', fg: 'white', icon: '✓' },
  warning: { bg: 'yellow', fg: 'black', icon: '⚠' },
  error: { bg: 'red', fg: 'white', icon: '✕' },
} as const;

export const Toast: React.FC<ToastProps> = ({
  type,
  message,
  duration = 3000,
  onDismiss,
  action,
}) => {
  const [visible, setVisible] = useState(true);
  const style = toastStyles[type];

  useEffect(() => {
    if (duration > 0 && type !== 'error') {
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, type, onDismiss]);

  useInput((input, key) => {
    if (key.escape || key.space) {
      setVisible(false);
      onDismiss();
    }
    if (key.return && action) {
      action.onClick();
      setVisible(false);
      onDismiss();
    }
  });

  if (!visible) return null;

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      paddingX={2}
      paddingY={1}
      marginBottom={1}
      backgroundColor={style.bg}
      color={style.fg}
      borderStyle="round"
    >
      <Text bold marginRight={1}>{style.icon}</Text>
      <Text>{message}</Text>
      {action && (
        <Box marginLeft={2} flexDirection="row" alignItems="center">
          <Text>[</Text>
          <Text bold underline>{action.label}</Text>
          <Text>]</Text>
        </Box>
      )}
    </Box>
  );
};