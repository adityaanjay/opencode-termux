import React, { useState, useEffect, useRef } from 'react';
import { Text, Box, useInput, useStdout } from 'ink';

interface ScrollViewProps {
  children: React.ReactNode;
  direction?: 'vertical' | 'horizontal';
  onScroll?: (position: number) => void;
  stickyBottom?: boolean;
}

export const ScrollView: React.FC<ScrollViewProps> = ({
  children,
  direction = 'vertical',
  onScroll,
  stickyBottom = false,
}) => {
  const { rows, columns } = useStdout();
  const [scrollOffset, setScrollOffset] = useState(0);
  const contentRef = useRef<Box>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useInput((input, key) => {
    if (direction === 'vertical') {
      if (key.upArrow) {
        setScrollOffset(o => Math.max(0, o - 1));
      }
      if (key.downArrow) {
        setScrollOffset(o => Math.min(contentHeight - (rows || 24), o + 1));
      }
      if (key.pageUp) {
        setScrollOffset(o => Math.max(0, o - (rows || 24) + 2));
      }
      if (key.pageDown) {
        setScrollOffset(o => Math.min(contentHeight, o + (rows || 24) - 2));
      }
      if (key.home) {
        setScrollOffset(0);
      }
      if (key.end) {
        setScrollOffset(contentHeight);
      }
    }
  });

  useEffect(() => {
    onScroll?.(scrollOffset);
  }, [scrollOffset, onScroll]);

  return (
    <Box
      ref={contentRef}
      flexDirection={direction === 'vertical' ? 'column' : 'row'}
      overflow="hidden"
      height={rows ? rows - 4 : undefined}
    >
      <Box
        marginTop={-scrollOffset}
        onMount={({ height }) => setContentHeight(height)}
      >
        {children}
      </Box>
    </Box>
  );
};