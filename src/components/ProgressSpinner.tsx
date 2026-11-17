import React, { useEffect, useState } from 'react';
import { Text, Box } from 'ink';

interface ProgressSpinnerProps {
  variant?: 'dots' | 'bar' | 'pulse';
  progress?: number; // 0-100, null = indeterminate
  label?: string;
  size?: 'inline' | 'line';
}

const spinners = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  pulse: ['░', '▒', '▓', '▒'],
} as const;

export const ProgressSpinner: React.FC<ProgressSpinnerProps> = ({
  variant = 'dots',
  progress,
  label,
  size = 'inline',
}) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (progress !== undefined && progress >= 100) return;
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % spinners[variant].length);
    }, 100);
    return () => clearInterval(interval);
  }, [variant, progress]);

  if (size === 'line') {
    const barWidth = 30;
    const filled = progress !== undefined ? Math.round((progress / 100) * barWidth) : frame % (barWidth + 1);
    const empty = barWidth - filled;
    return (
      <Box flexDirection="row" alignItems="center">
        <Text color="cyan">{label || 'Progress'}</Text>
        <Text marginLeft={1} color="gray">[</Text>
        <Text color="cyan">{'█'.repeat(filled)}</Text>
        <Text color="gray" dimColor>{'░'.repeat(empty)}</Text>
        <Text color="gray">]</Text>
        {progress !== undefined && (
          <Text marginLeft={1} color="white">{progress}%</Text>
        )}
      </Box>
    );
  }

  const spinnerChars = spinners[variant];
  const char = spinnerChars[frame % spinnerChars.length];

  return (
    <Box flexDirection="row" alignItems="center">
      <Text color="cyan">{char}</Text>
      {label && <Text marginLeft={1}>{label}</Text>}
      {progress !== undefined && (
        <Text marginLeft={1} color="gray">({progress}%)</Text>
      )}
    </Box>
  );
};