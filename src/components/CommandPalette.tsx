import React, { useState, useEffect } from 'react';
import { Text, Box, useInput, useStdout } from 'ink';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  items: CommandItem[];
  onSelect: (item: CommandItem) => void;
  onClose: () => void;
  placeholder?: string;
  filter?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  items,
  onSelect,
  onClose,
  placeholder = 'Type to search commands...',
  filter = '',
}) => {
  const { write, columns } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [localFilter, setLocalFilter] = useState(filter);

  const filteredItems = items.filter(item =>
    item.label.toLowerCase().includes(localFilter.toLowerCase()) ||
    item.description.toLowerCase().includes(localFilter.toLowerCase()) ||
    item.category.toLowerCase().includes(localFilter.toLowerCase())
  );

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.return) {
      if (filteredItems[selectedIndex]) {
        onSelect(filteredItems[selectedIndex]);
      }
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(filteredItems.length - 1, i + 1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setLocalFilter(f => f + input);
      setSelectedIndex(0);
      return;
    }
    if (key.backspace) {
      setLocalFilter(f => f.slice(0, -1));
      setSelectedIndex(0);
      return;
    }
  });

  const width = Math.min(columns || 80, 80);

  return (
    <Box
      width={width}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      flexDirection="column"
    >
      <Box flexDirection="row" alignItems="center" marginBottom={1}>
        <Text color="cyan">⌘ </Text>
        <Text>{localFilter}</Text>
        <Text color="gray" dimColor>{` (${filteredItems.length} results)`}</Text>
      </Box>
      <Box flexDirection="column" height={Math.min(10, filteredItems.length + 2)}>
        {filteredItems.slice(0, 10).map((item, i) => (
          <Box
            key={item.id}
            flexDirection="row"
            alignItems="center"
            paddingX={1}
            paddingY={1}
            backgroundColor={i === selectedIndex ? 'blue' : 'transparent'}
            color={i === selectedIndex ? 'white' : 'inherit'}
          >
            <Text bold>{item.label}</Text>
            <Text marginLeft={2} color="gray" dimColor>{item.description}</Text>
            <Text marginLeft={2} color="gray">({item.category})</Text>
          </Box>
        ))}
        {filteredItems.length === 0 && (
          <Text color="gray" dimColor>No matches found</Text>
        )}
      </Box>
    </Box>
  );
};