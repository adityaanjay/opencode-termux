import React from 'react';
import { Text, Box } from 'ink';

interface KeyHintProps {
  key: string;
  description: string;
  variant?: 'single' | 'chord';
  visible?: boolean;
}

export const KeyHint: React.FC<KeyHintProps> = ({
  key,
  description,
  variant = 'single',
  visible = true,
}) => {
  if (!visible) return null;

  return (
    <Box flexDirection="row" alignItems="center" marginRight={2}>
      <Text backgroundColor="gray" color="white" bold paddingX={1} paddingY={1}>
        {key}
      </Text>
      <Text marginLeft={1} color="gray" dimColor>{description}</Text>
    </Box>
  );
};