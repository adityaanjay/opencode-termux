import React from 'react';
import { Text, Box } from 'ink';
import type { Message } from '../ai/types.js';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  theme: 'dark' | 'light';
}

const roleStyles = {
  user: { backgroundColor: 'blue', color: 'white', bold: true },
  assistant: { backgroundColor: 'gray', color: 'white' },
  system: { backgroundColor: 'yellow', color: 'black' },
  tool: { backgroundColor: 'cyan', color: 'black' },
} as const;

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming, theme }) => {
  const style = roleStyles[message.role];
  const prefix = message.role === 'user' ? 'You' :
                 message.role === 'assistant' ? 'AI' :
                 message.role === 'system' ? 'System' : 'Tool';

  return (
    <Box marginY={1} paddingX={1} paddingY={1}>
      <Box flexDirection="row" marginBottom={1}>
        <Text {...style}>{` ${prefix} `}</Text>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <Text color="yellow" marginLeft={1}>
            🔧 {message.toolCalls.length} tool(s)
          </Text>
        )}
        {isStreaming && (
          <Text color="green" marginLeft={1}>
            ●
          </Text>
        )}
      </Box>
      <Text wrap="wrap">{message.content}</Text>
      {message.toolCalls && message.toolCalls.map((tc, i) => (
        <Box key={i} marginTop={1} paddingLeft={2} borderLeft={{ char: '│', color: 'gray' }}>
          <Text color="gray">▶ {tc.function.name}</Text>
          <Text color="gray" dimColor>{tc.function.arguments}</Text>
        </Box>
      ))}
    </Box>
  );
};