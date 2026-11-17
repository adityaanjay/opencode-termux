import React from 'react';
import { Text, Box } from 'ink';

interface AgentIndicatorProps {
  agent: 'build' | 'plan' | 'general';
  state?: 'active' | 'busy' | 'error';
  compact?: boolean;
  onClick?: () => void;
}

const agentStyles = {
  build: { label: 'BUILD', icon: '⚡', backgroundColor: 'blue', color: 'white' },
  plan: { label: 'PLAN', icon: '📋', backgroundColor: 'cyan', color: 'white' },
  general: { label: 'GEN', icon: '🛠', backgroundColor: 'green', color: 'white' },
} as const;

export const AgentIndicator: React.FC<AgentIndicatorProps> = ({
  agent,
  state = 'active',
  compact = false,
  onClick,
}) => {
  const style = agentStyles[agent];
  const stateIndicator = state === 'busy' ? ' ◐' : state === 'error' ? ' ✕' : '';

  if (compact) {
    return (
      <Text {...style} bold>
        {` ${style.label}${stateIndicator} `}
      </Text>
    );
  }

  return (
    <Box flexDirection="row" alignItems="center" marginRight={2}>
      <Text {...style} bold>
        {` ${style.icon} ${style.label} `}
      </Text>
      <Text color="gray" dimColor>
        {style.description}
      </Text>
    </Box>
  );
};