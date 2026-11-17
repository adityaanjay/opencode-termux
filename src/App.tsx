import React, { useState, useEffect, useRef, useCallback } from 'react';
import { render, Text, Box, useInput, useStdout, useFocus } from 'ink';
import { v4 as uuidv4 } from 'uuid';
import { db, initializeDatabase, closeDatabase } from './db/index.js';
import { sessions, messages, fileRefs, commands, agentConfigs, settings } from './db/schema.js';
import { eq, desc, asc, and } from 'drizzle-orm';
import { createAIProvider, getAgentConfig, getModelSetting, getTemperatureSetting, getMaxTokensSetting, AVAILABLE_TOOLS, AgentType } from './ai/index.js';
import { MessageBubble } from './components/MessageBubble.js';
import { InputBox } from './components/InputBox.js';
import { AgentIndicator } from './components/AgentIndicator.js';
import { StatusBar } from './components/StatusBar.js';
import { CommandPalette } from './components/CommandPalette.js';
import { Toast } from './components/Toast.js';
import { KeyHint } from './components/KeyHint.js';
import { ScrollView } from './components/ScrollView.js';
import { SyntaxHighlighter } from './components/SyntaxHighlighter.js';
import { ProgressSpinner } from './components/ProgressSpinner.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { DiffView } from './components/DiffView.js';
import { FileTree } from './components/FileTree.js';
import type { Message, ToolCall, AgentConfig } from './ai/types.js';

type Screen = 'splash' | 'chat' | 'agent-select' | 'file-view' | 'file-edit' | 'command-output' | 'session-list' | 'settings' | 'help' | 'error';
type AgentType = 'build' | 'plan' | 'general';

interface AppState {
  screen: Screen;
  currentSessionId: string | null;
  sessions: any[];
  messages: Message[];
  inputValue: string;
  inputMode: 'chat' | 'command' | 'file';
  activeAgent: AgentType;
  commandHistory: string[];
  toasts: Array<{ id: string; type: 'info' | 'success' | 'warning' | 'error'; message: string; duration?: number }>;
  showCommandPalette: boolean;
  showAgentSelector: boolean;
  showFileTree: boolean;
  showHelp: boolean;
  showConfirmDialog: { title: string; message: string; onConfirm: () => void; onCancel: () => void } | null;
  showDiffView: { oldContent: string; newContent: string; onAccept: () => void; onReject: () => void } | null;
  connectionStatus: 'connected' | 'disconnected' | 'busy' | 'offline';
  tokensUsed: number;
  tokensLimit: number;
  sessionStartTime: number;
  error: string | null;
  isStreaming: boolean;
  pendingToolCalls: ToolCall[];
}

const initialState: AppState = {
  screen: 'splash',
  currentSessionId: null,
  sessions: [],
  messages: [],
  inputValue: '',
  inputMode: 'chat',
  activeAgent: 'build',
  commandHistory: [],
  toasts: [],
  showCommandPalette: false,
  showAgentSelector: false,
  showFileTree: false,
  showHelp: false,
  showConfirmDialog: null,
  showDiffView: null,
  connectionStatus: 'connected',
  tokensUsed: 0,
  tokensLimit: 8192,
  sessionStartTime: Date.now(),
  error: null,
  isStreaming: false,
  pendingToolCalls: [],
};

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>(initialState);
  const { rows, columns } = useStdout();
  const messagesEndRef = useRef<Box>(null);
  const sessionStartRef = useRef(Date.now());

  // Initialize database on mount
  useEffect(() => {
    initializeDatabase();
    loadSessions();
    createNewSession();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeDatabase();
    };
  }, []);

  const loadSessions = async () => {
    const allSessions = await db.select().from(sessions).orderBy(desc(sessions.updatedAt)).all();
    setState(s => ({ ...s, sessions: allSessions }));
  };

  const createNewSession = async () => {
    const id = uuidv4();
    await db.insert(sessions).values({
      id,
      name: `Session ${new Date().toLocaleTimeString()}`,
      agentType: 'build',
      messageCount: 0,
    });
    setState(s => ({ ...s, currentSessionId: id, messages: [], screen: 'chat', sessionStartTime: Date.now() }));
    sessionStartRef.current = Date.now();
  };

  const loadSession = async (sessionId: string) => {
    const msgs = await db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.createdAt)).all();
    const parsedMessages: Message[] = msgs.map(m => ({
      role: m.role as Message['role'],
      content: m.content,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
      toolCallId: m.toolCallId || undefined,
    }));
    setState(s => ({
      ...s,
      currentSessionId: sessionId,
      messages: parsedMessages,
      screen: 'chat',
      sessionStartTime: Date.now(),
    }));
    sessionStartRef.current = Date.now();
  };

  const saveMessage = async (message: Message) => {
    if (!state.currentSessionId) return;
    await db.insert(messages).values({
      id: uuidv4(),
      sessionId: state.currentSessionId,
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      toolCallId: message.toolCallId || null,
      tokensIn: 0,
      tokensOut: 0,
    });
    await db.update(sessions).set({ messageCount: state.messages.length + 1 }).where(eq(sessions.id, state.currentSessionId));
  };

  const addToast = (type: 'info' | 'success' | 'warning' | 'error', message: string, duration = 3000) => {
    const id = uuidv4();
    setState(s => ({ ...s, toasts: [...s.toasts, { id, type, message, duration }] }));
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  };

  const removeToast = (id: string) => {
    setState(s => ({ ...s, toasts: s.toasts.filter(t => t.id !== id) }));
  };

  const handleInputSubmit = async (value: string) => {
    if (!value.trim()) return;

    setState(s => ({
      ...s,
      inputValue: '',
      inputMode: 'chat',
      commandHistory: [...s.commandHistory, value].slice(-50),
    }));

    if (value.startsWith('!')) {
      await handleCommand(value.slice(1));
      return;
    }

    if (value.startsWith('@')) {
      await handleFileRead(value.slice(1));
      return;
    }

    if (value.startsWith('/')) {
      await handleSlashCommand(value.slice(1));
      return;
    }

    await sendMessage(value);
  };

  const sendMessage = async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    setState(s => ({
      ...s,
      messages: [...s.messages, userMessage],
      isStreaming: true,
      tokensUsed: s.tokensUsed + Math.ceil(content.length / 4),
    }));
    await saveMessage(userMessage);

    try {
      const provider = await createAIProvider();
      const agentConfig = await getAgentConfig(state.activeAgent);
      const model = await getModelSetting();
      const temperature = await getTemperatureSetting();
      const maxTokens = await getMaxTokensSetting();

      let assistantContent = '';
      const toolCalls: ToolCall[] = [];

      for await (const chunk of provider.streamChat(
        [...state.messages, userMessage],
        AVAILABLE_TOOLS,
        {
          model: agentConfig.model,
          temperature: agentConfig.temperature,
          maxTokens: agentConfig.maxTokens,
          systemPrompt: agentConfig.systemPrompt,
          onToolCall: (tc) => {
            toolCalls.push(tc);
            setState(s => ({ ...s, pendingToolCalls: [...s.pendingToolCalls, tc] }));
          },
        }
      )) {
        if (chunk.type === 'text') {
          assistantContent += chunk.content || '';
          setState(s => ({
            ...s,
            messages: s.messages.slice(0, -1).concat([
              { role: 'assistant', content: assistantContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined },
            ]),
          }));
        }
        if (chunk.type === 'done') {
          const finalMessage: Message = {
            role: 'assistant',
            content: assistantContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          };
          setState(s => ({
            ...s,
            messages: s.messages.slice(0, -1).concat([finalMessage]),
            isStreaming: false,
            pendingToolCalls: [],
          }));
          await saveMessage(finalMessage);

          // Execute tool calls
          for (const tc of toolCalls) {
            await executeToolCall(tc);
          }
        }
      }
    } catch (error) {
      setState(s => ({
        ...s,
        messages: s.messages.slice(0, -1).concat([
          { role: 'system', content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` },
        ]),
        isStreaming: false,
      }));
      addToast('error', `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const executeToolCall = async (toolCall: ToolCall) => {
    const { name, arguments: args } = toolCall.function;
    let result: string;

    try {
      const parsedArgs = JSON.parse(args);

      switch (name) {
        case 'read_file': {
          const { readFile } = await import('./commands/file.js');
          result = await readFile(parsedArgs.path);
          break;
        }
        case 'write_file': {
          const { writeFile } = await import('./commands/file.js');
          result = await writeFile(parsedArgs.path, parsedArgs.content);
          break;
        }
        case 'edit_file': {
          const { editFile } = await import('./commands/file.js');
          result = await editFile(parsedArgs.path, parsedArgs.oldText, parsedArgs.newText);
          break;
        }
        case 'run_command': {
          const { runCommand } = await import('./commands/shell.js');
          result = await runCommand(parsedArgs.command, parsedArgs.cwd, parsedArgs.timeout);
          break;
        }
        case 'list_files': {
          const { listFiles } = await import('./commands/file.js');
          result = await listFiles(parsedArgs.path, parsedArgs.recursive);
          break;
        }
        case 'grep': {
          const { grep } = await import('./commands/file.js');
          result = await grep(parsedArgs.pattern, parsedArgs.path, parsedArgs.include);
          break;
        }
        default:
          result = `Unknown tool: ${name}`;
      }
    } catch (error) {
      result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    const toolMessage: Message = {
      role: 'tool',
      content: result,
      toolCallId: toolCall.id,
    };

    setState(s => ({
      ...s,
      messages: [...s.messages, toolMessage],
    }));
    await saveMessage(toolMessage);
  };

  const handleCommand = async (command: string) => {
    const { runCommand } = await import('./commands/shell.js');
    const startTime = Date.now();
    const result = await runCommand(command, process.cwd());
    const duration = Date.now() - startTime;

    await db.insert(commands).values({
      id: uuidv4(),
      sessionId: state.currentSessionId!,
      command,
      cwd: process.cwd(),
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: duration,
    });

    setState(s => ({
      ...s,
      messages: [...s.messages, {
        role: 'tool',
        content: `Command: ${command}\nExit code: ${result.exitCode}\nDuration: ${duration}ms\n${result.stdout}\n${result.stderr}`,
      }],
    }));
  };

  const handleFileRead = async (path: string) => {
    const { readFile } = await import('./commands/file.js');
    try {
      const content = await readFile(path);
      setState(s => ({
        ...s,
        messages: [...s.messages, {
          role: 'tool',
          content: `File: ${path}\n\`\`\`\n${content}\n\`\`\``,
        }],
        screen: 'file-view',
      }));
    } catch (error) {
      addToast('error', `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSlashCommand = async (cmd: string) => {
    const parts = cmd.split(' ');
    const command = parts[0];
    const args = parts.slice(1).join(' ');

    switch (command) {
      case 'help':
      case '?':
        setState(s => ({ ...s, showHelp: true }));
        break;
      case 'session':
        setState(s => ({ ...s, screen: 'session-list' }));
        break;
      case 'config':
        setState(s => ({ ...s, screen: 'settings' }));
        break;
      case 'agent':
        setState(s => ({ ...s, showAgentSelector: true }));
        break;
      case 'new':
        await createNewSession();
        break;
      case 'clear':
        setState(s => ({ ...s, messages: [] }));
        break;
      default:
        addToast('warning', `Unknown command: /${command}`);
    }
  };

  const switchAgent = async (agent: AgentType) => {
    if (!state.currentSessionId) return;
    await db.update(sessions).set({ agentType: agent }).where(eq(sessions.id, state.currentSessionId));
    setState(s => ({ ...s, activeAgent: agent, showAgentSelector: false }));
    addToast('info', `Switched to ${agent} agent`);
  };

  const handleKeyPress = useCallback((input: string, key: any) => {
    if (key.tab && state.inputMode === 'chat') {
      setState(s => ({ ...s, showAgentSelector: true }));
      return;
    }
    if (key.escape) {
      if (state.showAgentSelector) setState(s => ({ ...s, showAgentSelector: false }));
      if (state.showCommandPalette) setState(s => ({ ...s, showCommandPalette: false }));
      if (state.showFileTree) setState(s => ({ ...s, showFileTree: false }));
      if (state.showHelp) setState(s => ({ ...s, showHelp: false }));
      if (state.showConfirmDialog) setState(s => ({ ...s, showConfirmDialog: null }));
      if (state.showDiffView) setState(s => ({ ...s, showDiffView: null }));
      if (state.inputMode !== 'chat') setState(s => ({ ...s, inputMode: 'chat', inputValue: '' }));
    }
  }, [state.showAgentSelector, state.showCommandPalette, state.showFileTree, state.showHelp, state.showConfirmDialog, state.showDiffView, state.inputMode]);

  useInput(handleKeyPress);

  // Render current screen
  const renderScreen = () => {
    switch (state.screen) {
      case 'splash':
        return (
          <Box flexDirection="column" alignItems="center" justifyContent="center" height={rows || 24}>
            <Text backgroundColor="blue" color="white" bold paddingX={4} paddingY={2} marginBottom={2}>
              opencode-termux
            </Text>
            <Text color="gray" dimColor>AI Coding Agent for Termux Android</Text>
            <Text marginTop={2} color="gray">Press any key to start...</Text>
            <Text marginTop={1} color="gray" dimColor>Tab: Switch agent | !: Command | @: File | ?: Help</Text>
          </Box>
        );

      case 'chat':
        return (
          <Box flexDirection="column" height={rows || 24}>
            <ScrollView stickyBottom>
              <Box flexDirection="column">
                {state.messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} isStreaming={state.isStreaming && i === state.messages.length - 1} />
                ))}
                <Box ref={messagesEndRef} />
              </Box>
            </ScrollView>
            <InputBox
              value={state.inputValue}
              onChange={v => setState(s => ({ ...s, inputValue: v }))}
              onSubmit={handleInputSubmit}
              placeholder={state.activeAgent === 'plan' ? 'Ask a question (read-only mode)...' : 'Type a message...'}
              mode={state.inputMode}
              history={state.commandHistory}
              error={state.error || undefined}
            />
            <StatusBar
              connection={state.connectionStatus}
              model={state.activeAgent === 'plan' ? 'plan' : 'build'}
              tokens={{ used: state.tokensUsed, limit: state.tokensLimit }}
              agent={state.activeAgent}
              sessionDuration={Date.now() - sessionStartRef.current}
            />
          </Box>
        );

      case 'session-list':
        return (
          <Box flexDirection="column" paddingX={2} paddingY={2}>
            <Text bold marginBottom={1}>Sessions</Text>
            <Box flexDirection="column">
              {state.sessions.map(sess => (
                <Box key={sess.id} flexDirection="row" alignItems="center" paddingY={1} marginBottom={1} backgroundColor={sess.id === state.currentSessionId ? 'blue' : 'transparent'}>
                  <Text marginRight={2}>{sess.name || 'Unnamed'}</Text>
                  <Text color="gray" dimColor>{new Date(sess.updatedAt).toLocaleString()}</Text>
                  <Text marginLeft={2} color="gray">({sess.messageCount} msgs)</Text>
                </Box>
              ))}
            </Box>
            <Text marginTop={2} color="gray" dimColor>Enter: Resume | n: New | d: Delete | Esc: Back</Text>
          </Box>
        );

      case 'settings':
        return (
          <Box flexDirection="column" paddingX={2} paddingY={2}>
            <Text bold marginBottom={1}>Settings</Text>
            <Text color="gray" dimColor>Not fully implemented yet. Use /config in chat.</Text>
          </Box>
        );

      case 'help':
        return (
          <Box flexDirection="column" paddingX={2} paddingY={2}>
            <Text bold marginBottom={1}>Help</Text>
            <Box flexDirection="column">
              <Text><Text bold>Tab</Text> - Switch agent (build/plan/general)</Text>
              <Text><Text bold>!</Text> - Run shell command</Text>
              <Text><Text bold>@</Text> - Read file</Text>
              <Text><Text bold>/</Text> - Slash commands (help, session, config, agent, new, clear)</Text>
              <Text><Text bold>?</Text> - Show this help</Text>
              <Text><Text bold>Esc</Text> - Cancel/Close</Text>
            </Box>
            <Text marginTop={2} color="gray" dimColor>Press Esc to close</Text>
          </Box>
        );

      default:
        return <Text>Unknown screen: {state.screen}</Text>;
    }
  };

  return (
    <Box flexDirection="column" height={rows || 24}>
      {renderScreen()}

      {state.showAgentSelector && (
        <Box position="absolute" top={2} right={2} zIndex={10}>
          <Box borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
            <Text bold marginBottom={1}>Select Agent</Text>
            {(['build', 'plan', 'general'] as AgentType[]).map(agent => (
              <Box
                key={agent}
                flexDirection="row"
                alignItems="center"
                paddingX={1}
                paddingY={1}
                backgroundColor={agent === state.activeAgent ? 'blue' : 'transparent'}
                onClick={() => switchAgent(agent)}
              >
                <AgentIndicator agent={agent} compact />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {state.showHelp && (
        <Box position="absolute" top="center" left="center" zIndex={10}>
          <Box width={60} borderStyle="round" borderColor="cyan" paddingX={2} paddingY={2}>
            <Text bold marginBottom={1}>Help</Text>
            <Box flexDirection="column">
              <Text><Text bold>Tab</Text> - Switch agent</Text>
              <Text><Text bold>!</Text> - Run command</Text>
              <Text><Text bold>@</Text> - Read file</Text>
              <Text><Text bold>/</Text> - Slash commands</Text>
              <Text><Text bold>?</Text> - This help</Text>
              <Text><Text bold>Esc</Text> - Close</Text>
            </Box>
          </Box>
        </Box>
      )}

      {state.toasts.map(toast => (
        <Toast key={toast.id} {...toast} onDismiss={() => removeToast(toast.id)} />
      ))}

      {state.showConfirmDialog && (
        <Box position="absolute" top="center" left="center" zIndex={20}>
          <ConfirmDialog {...state.showConfirmDialog} />
        </Box>
      )}

      {state.showDiffView && (
        <Box position="absolute" top="center" left="center" zIndex={20}>
          <DiffView {...state.showDiffView} />
        </Box>
      )}
    </Box>
  );
};

export default App;