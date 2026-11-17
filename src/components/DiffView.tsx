import React from 'react';
import { Text, Box } from 'ink';

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  language?: string;
  onAccept?: () => void;
  onReject?: () => void;
  readOnly?: boolean;
}

export const DiffView: React.FC<DiffViewProps> = ({
  oldContent,
  newContent,
  language,
  onAccept,
  onReject,
  readOnly = false,
}) => {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Simple diff algorithm - find common lines
  const maxLines = Math.max(oldLines.length, newLines.length);
  const diffLines: { type: 'add' | 'remove' | 'context'; content: string }[] = [];

  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diffLines.push({ type: 'context', content: oldLines[i] });
      i++; j++;
    } else if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
      // Check if next old line matches next new line
      if (i + 1 < oldLines.length && j < newLines.length && oldLines[i + 1] === newLines[j]) {
        diffLines.push({ type: 'remove', content: oldLines[i] });
        i++;
      } else if (j + 1 < newLines.length && i < oldLines.length && oldLines[i] === newLines[j + 1]) {
        diffLines.push({ type: 'add', content: newLines[j] });
        j++;
      } else if (i < oldLines.length) {
        diffLines.push({ type: 'remove', content: oldLines[i] });
        i++;
      }
    } else if (j < newLines.length) {
      diffLines.push({ type: 'add', content: newLines[j] });
      j++;
    }
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={1}>
      <Box flexDirection="row" marginBottom={1}>
        <Text color="green" bold>+ Added</Text>
        <Text marginLeft={2} color="red" bold>- Removed</Text>
        <Text marginLeft={2} color="gray" dimColor>  Context</Text>
      </Box>
      <Box flexDirection="column" maxHeight={20}>
        {diffLines.map((line, idx) => (
          <Box key={idx} flexDirection="row">
            {line.type === 'add' && <Text color="green" bold>+ </Text>}
            {line.type === 'remove' && <Text color="red" bold>- </Text>}
            {line.type === 'context' && <Text color="gray" dimColor>  </Text>}
            <Text color={line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : 'gray'}>
              {line.content}
            </Text>
          </Box>
        ))}
      </Box>
      {!readOnly && onAccept && onReject && (
        <Box flexDirection="row" justifyContent="flex-end" marginTop={2}>
          <Box
            marginRight={1}
            paddingX={2}
            paddingY={1}
            backgroundColor="gray"
            color="white"
            onClick={onReject}
          >
            Reject
          </Box>
          <Box
            paddingX={2}
            paddingY={1}
            backgroundColor="green"
            color="white"
            onClick={onAccept}
          >
            Accept
          </Box>
        </Box>
      )}
    </Box>
  );
};