import React from 'react';
import { Text, Box } from 'ink';

interface SyntaxHighlighterProps {
  code: string;
  language: string;
  lineNumbers?: boolean;
  theme?: 'dark' | 'light';
  maxLines?: number;
}

const themes = {
  dark: {
    keyword: 'cyan',
    string: 'green',
    number: 'yellow',
    comment: 'gray',
    function: 'blue',
    type: 'magenta',
    operator: 'white',
  },
  light: {
    keyword: 'blue',
    string: 'green',
    number: 'orange',
    comment: 'gray',
    function: 'blue',
    type: 'magenta',
    operator: 'black',
  },
};

const languagePatterns: Record<string, RegExp[]> = {
  typescript: [
    { pattern: /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|this|super|class|extends|implements|interface|type|enum|import|export|from|as|default|async|await|Promise|then|catch)\b/g, color: 'keyword' },
    { pattern: /\b(string|number|boolean|object|Array|Promise|Map|Set|Date|RegExp|Error|any|unknown|never|void|null|undefined)\b/g, color: 'type' },
    { pattern: /"([^"\\]|\\.)*"/g, color: 'string' },
    { pattern: /'([^'\\]|\\.)*'/g, color: 'string' },
    { pattern: /`([^`\\]|\\.)*`/g, color: 'string' },
    { pattern: /\b\d+\.?\d*\b/g, color: 'number' },
    { pattern: /\/\/.*$/gm, color: 'comment' },
    { pattern: /\/\*[\s\S]*?\*\//g, color: 'comment' },
    { pattern: /\b(\w+)(?=\s*\()/g, color: 'function' },
  ],
  python: [
    { pattern: /\b(def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|lambda|and|or|not|in|is|None|True|False)\b/g, color: 'keyword' },
    { pattern: /\b(str|int|float|bool|list|dict|set|tuple|None)\b/g, color: 'type' },
    { pattern: /"([^"\\]|\\.)*"/g, color: 'string' },
    { pattern: /'([^'\\]|\\.)*'/g, color: 'string' },
    { pattern: /""".*?"""/g, color: 'string' },
    { pattern: /'''.*?'''/g, color: 'string' },
    { pattern: /\b\d+\.?\d*\b/g, color: 'number' },
    { pattern: /#.*$/gm, color: 'comment' },
    { pattern: /\b(\w+)(?=\s*\()/g, color: 'function' },
  ],
  rust: [
    { pattern: /\b(fn|let|mut|if|else|match|loop|while|for|in|break|continue|return|struct|enum|impl|trait|mod|use|pub|const|static|async|await|move)\b/g, color: 'keyword' },
    { pattern: /\b(i32|u32|i64|u64|f32|f64|bool|str|String|Vec|Option|Result|Box|Arc|Rc)\b/g, color: 'type' },
    { pattern: /"([^"\\]|\\.)*"/g, color: 'string' },
    { pattern: /\b\d+\.?\d*\b/g, color: 'number' },
    { pattern: /\/\/.*$/gm, color: 'comment' },
    { pattern: /\b(\w+)(?=\s*\()/g, color: 'function' },
  ],
};

export const SyntaxHighlighter: React.FC<SyntaxHighlighterProps> = ({
  code,
  language,
  lineNumbers = true,
  theme = 'dark',
  maxLines,
}) => {
  const themeColors = themes[theme];
  const patterns = languagePatterns[language] || [];

  const lines = code.split('\n');
  const displayLines = maxLines ? lines.slice(0, maxLines) : lines;
  const truncated = maxLines && lines.length > maxLines;

  const highlightLine = (line: string) => {
    let segments: { text: string; color: keyof typeof themeColors }[] = [];
    let lastIndex = 0;

    for (const { pattern, color } of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags + 'g');
      let match;
      while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          segments.push({ text: line.slice(lastIndex, match.index), color: 'operator' });
        }
        segments.push({ text: match[0], color });
        lastIndex = match.index + match[0].length;
      }
    }
    if (lastIndex < line.length) {
      segments.push({ text: line.slice(lastIndex), color: 'operator' });
    }
    return segments.length > 0 ? segments : [{ text: line, color: 'operator' }];
  };

  return (
    <Box flexDirection="column">
      {displayLines.map((line, i) => (
        <Box key={i} flexDirection="row">
          {lineNumbers && (
            <Text color="gray" dimColor marginRight={2} width={4} textAlign="right">
              {String(i + 1).padStart(3, ' ')}
            </Text>
          )}
          <Box flexDirection="row">
            {highlightLine(line).map((seg, j) => (
              <Text key={j} color={themeColors[seg.color] as any}>{seg.text}</Text>
            ))}
          </Box>
        </Box>
      ))}
      {truncated && (
        <Text color="gray" dimColor marginTop={1} marginLeft={6}>
          ... {lines.length - maxLines} more lines
        </Text>
      )}
    </Box>
  );
};