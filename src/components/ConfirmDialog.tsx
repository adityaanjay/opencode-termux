import React from 'react';
import { Text, Box, useInput } from 'ink';

interface ConfirmDialogProps {
  title: string;
  message: string;
  variant?: 'yesno' | 'acceptreject' | 'custom';
  primaryLabel?: string;
  secondaryLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  dangerous?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  variant = 'yesno',
  primaryLabel,
  secondaryLabel,
  onConfirm,
  onCancel,
  dangerous = false,
}) => {
  const labels = variant === 'yesno'
    ? { primary: primaryLabel || 'Yes', secondary: secondaryLabel || 'No' }
    : variant === 'acceptreject'
    ? { primary: primaryLabel || 'Accept', secondary: secondaryLabel || 'Reject' }
    : { primary: primaryLabel || 'OK', secondary: secondaryLabel || 'Cancel' };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onConfirm();
      return;
    }
    if (key.y || key.Y) {
      onConfirm();
      return;
    }
    if (key.n || key.N) {
      onCancel();
      return;
    }
  });

  const primaryBg = dangerous ? 'red' : 'blue';

  return (
    <Box
      flexDirection="column"
      paddingX={2}
      paddingY={2}
      borderStyle="round"
      borderColor={dangerous ? 'red' : 'cyan'}
      width={60}
    >
      <Text bold marginBottom={1}>{title}</Text>
      <Text marginBottom={2} wrap="wrap">{message}</Text>
      <Box flexDirection="row" justifyContent="flex-end" marginTop={2}>
        <Box
          marginRight={1}
          paddingX={2}
          paddingY={1}
          backgroundColor="gray"
          color="white"
          onClick={onCancel}
        >
          {labels.secondary}
        </Box>
        <Box
          paddingX={2}
          paddingY={1}
          backgroundColor={primaryBg}
          color="white"
          onClick={onConfirm}
        >
          {labels.primary}
        </Box>
      </Box>
      <Text marginTop={1} color="gray" dimColor>
        ESC to cancel • Enter to confirm
      </Text>
    </Box>
  );
};