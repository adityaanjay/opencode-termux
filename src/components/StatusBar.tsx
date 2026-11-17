import React from 'react';
import { Text, Box } from 'ink';

interface StatusBarProps {
  connection: 'connected' | 'disconnected' | 'busy' | 'offline';
  model: string;
  tokens: { used: number; limit: number };
  agent: 'build' | 'plan' | 'general';
  sessionDuration: number;
}

const connectionStyles = {
  connected: { label: '● CONNECTED', color: 'green' },
  disconnected: { label: '● DISCONNECTED', color: 'red' },
  busy: { label: '◐ BUSY', color: 'yellow' },
  offline: { label: '○ OFFLINE', color: 'gray' },
} as const;

export const StatusBar: React.FC<StatusBarProps> = ({
  connection,
  model,
  tokens,
  agent,
  sessionDuration,
}) => {
  const connStyle = connectionStyles[connection];
  const tokenPercent = tokens.limit > 0 ? Math.round((tokens.used / tokens.limit) * 100) : 0;
  const mins = Math.floor(sessionDuration / 60000);
  const secs = Math.floor((sessionDuration % 60000) / 1000);

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      width="100%"
      paddingX={1}
      height={1}
      backgroundColor="gray"
      color="white"
    >
      <Box flexDirection="row" alignItems="center">
        <Text color={connStyle.color}>{connStyle.label}</Text>
        <Text marginLeft={2} marginRight={2} color="gray">│</Text>
        <Text color="cyan">{model}</Text>
        <Text marginLeft={2} marginRight={2} color="gray">│</Text>
        <Text>Tokens: {tokens.used.toLocaleString()}/{tokens.limit.toLocaleString()} ({tokenPercent}%)</Text>
      </Box>
      <Box flexDirection="row" alignItems="center">
        <Text color="gray" marginRight={2}>│</Text>
        <Text>Session: {mins}m {secs}s</Text>
      </Box>
    </Box>
  );
};