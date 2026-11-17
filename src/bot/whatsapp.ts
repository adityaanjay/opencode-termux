import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto
} from '@whiskeysockets/baileys';

// MessageUpsertType values: 'notify' | 'append' | 'prepend' | 'replace'
type MessageUpsertType = 'notify' | 'append' | 'prepend' | 'replace';
import { db } from '../db/index.js';
import { settings, messages, sessions } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { createAIProvider, getAgentConfig, AVAILABLE_TOOLS } from '../ai/index.js';
import type { Message as AIMessage, ToolCall } from '../ai/types.js';
import { v4 as uuidv4 } from 'uuid';
import P from 'pino';

const logger = P({ level: 'silent' });

interface WhatsAppSessionData {
  sessionId: string | null;
  messages: AIMessage[];
  pendingToolCalls: ToolCall[];
  isProcessing: boolean;
  sock: WASocket | null;
}

const initialSessionData: WhatsAppSessionData = {
  sessionId: null,
  messages: [],
  pendingToolCalls: [],
  isProcessing: false,
  sock: null,
};

export async function createWhatsAppBot(): Promise<WASocket | null> {
  const sessionSetting = await db.select().from(settings).where(eq(settings.key, 'bot.whatsapp_session')).get();
  let sessionData: string | null = sessionSetting?.value?.replace(/"/g, '') || null;

  const { state, saveCreds } = await useMultiFileAuthState('./data/whatsapp_auth');

  // Restore session if exists
  if (sessionData) {
    try {
      const parsed = JSON.parse(sessionData);
      if (parsed.creds) {
        state.creds = parsed.creds;
      }
    } catch {
      // Ignore parse errors, start fresh
    }
  }

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`WhatsApp Baileys version: ${version.join('.')} (latest: ${isLatest})`);

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: true,
    browser: ['opencode-termux', 'Chrome', '1.0.0'],
  });

  // Save session credentials
  state.creds.events.push(saveCreds);

  sock.ev.on('creds.update', async () => {
    const sessionStr = JSON.stringify(state.creds);
    await db.update(settings).set({ value: `"${sessionStr}"` }).where(eq(settings.key, 'bot.whatsapp_session'));
  });

  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Scan QR code with WhatsApp to connect');
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`WhatsApp connection closed: ${lastDisconnect?.error?.message}, reconnect: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(() => createWhatsAppBot(), 5000);
      } else {
        console.log('Logged out, need to scan QR again');
      }
    }
  });

  // Handle messages
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== MessageUpsertType.Notify) return;

    for (const msg of msgs) {
      if (!msg.message || msg.key.fromMe) continue;

      await handleWhatsAppMessage(sock, msg);
    }
  });

  return sock;
}

async function handleWhatsAppMessage(sock: WASocket, msg: proto.IWebMessageInfo) {
  const jid = msg.key.remoteJid;
  if (!jid) return;

  const isGroup = jid.endsWith('@g.us');
  const sender = msg.key.participant || jid;
  const pushName = msg.pushName || 'User';

  // Get or create session for this chat
  const sessionSetting = await db.select().from(settings).where(eq(settings.key, `bot.whatsapp.session.${jid}`)).get();
  let sessionId = sessionSetting?.value?.replace(/"/g, '') || null;

  if (!sessionId) {
    sessionId = uuidv4();
    await db.insert(sessions).values({
      id: sessionId,
      name: `WhatsApp ${isGroup ? 'Group' : 'Chat'} ${pushName}`,
      agentType: 'build',
      messageCount: 0,
    });
    await db.update(settings).set({ value: `"${sessionId}"` }).where(eq(settings.key, `bot.whatsapp.session.${jid}`));
  }

  // Get message text
  const text = getMessageText(msg);
  if (!text) return;

  // Send "typing" indicator
  await sock.sendPresenceUpdate('composing', jid);

  try {
    const provider = await createAIProvider();
    const agentConfig = await getAgentConfig('build');
    const model = agentConfig.model;
    const temperature = agentConfig.temperature;
    const maxTokens = agentConfig.maxTokens;

    // Get conversation history
    const history = await db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(desc(messages.createdAt)).limit(20).all();
    const aiMessages: AIMessage[] = history.reverse().map(m => ({
      role: m.role as AIMessage['role'],
      content: m.content,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
      toolCallId: m.toolCallId || undefined,
    }));

    const userMessage: AIMessage = { role: 'user', content: text };
    aiMessages.push(userMessage);

    await db.insert(messages).values({
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: text,
      tokensIn: 0,
      tokensOut: 0,
    });

    let assistantContent = '';
    const toolCalls: ToolCall[] = [];

    for await (const chunk of provider.streamChat(
      aiMessages,
      AVAILABLE_TOOLS,
      {
        model,
        temperature,
        maxTokens,
        systemPrompt: agentConfig.systemPrompt,
        onToolCall: (tc) => {
          toolCalls.push(tc);
        },
      }
    )) {
      if (chunk.type === 'text' && chunk.content) {
        assistantContent += chunk.content;
      }

      if (chunk.type === 'done') {
        const finalMessage: AIMessage = {
          role: 'assistant',
          content: assistantContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };

        aiMessages.push(finalMessage);

        await db.insert(messages).values({
          id: uuidv4(),
          sessionId,
          role: 'assistant',
          content: assistantContent,
          toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
          tokensIn: 0,
          tokensOut: 0,
        });

        // Execute tool calls
        for (const tc of toolCalls) {
          await executeToolCall(sock, jid, tc, sessionId);
        }

        // Send response (split if too long)
        const maxLen = 4000;
        for (let i = 0; i < assistantContent.length; i += maxLen) {
          await sock.sendMessage(jid, { text: assistantContent.slice(i, i + maxLen) });
        }
        break;
      }
    }
  } catch (error) {
    await sock.sendMessage(jid, {
      text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  } finally {
    await sock.sendPresenceUpdate('paused', jid);
  }
}

async function executeToolCall(sock: WASocket, jid: string, toolCall: ToolCall, sessionId: string) {
  const { name, arguments: args } = toolCall.function;
  let result: string;

  try {
    const parsedArgs = JSON.parse(args);

    switch (name) {
      case 'read_file': {
        const { readFile } = await import('../commands/file.js');
        result = await readFile(parsedArgs.path);
        break;
      }
      case 'write_file': {
        const { writeFile } = await import('../commands/file.js');
        result = await writeFile(parsedArgs.path, parsedArgs.content);
        break;
      }
      case 'edit_file': {
        const { editFile } = await import('../commands/file.js');
        result = await editFile(parsedArgs.path, parsedArgs.oldText, parsedArgs.newText);
        break;
      }
      case 'run_command': {
        const { runCommand } = await import('../commands/shell.js');
        const cmdResult = await runCommand(parsedArgs.command, parsedArgs.cwd, parsedArgs.timeout);
        result = `Exit code: ${cmdResult.exitCode}\n${cmdResult.stdout}\n${cmdResult.stderr}`;
        break;
      }
      case 'list_files': {
        const { listFiles } = await import('../commands/file.js');
        result = await listFiles(parsedArgs.path, parsedArgs.recursive);
        break;
      }
      case 'grep': {
        const { grep } = await import('../commands/file.js');
        result = await grep(parsedArgs.pattern, parsedArgs.path, parsedArgs.include);
        break;
      }
      default:
        result = `Unknown tool: ${name}`;
    }
  } catch (error) {
    result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }

  const toolMessage: AIMessage = {
    role: 'tool',
    content: result,
    toolCallId: toolCall.id,
  };

  await db.insert(messages).values({
    id: uuidv4(),
    sessionId,
    role: 'tool',
    content: result,
    toolCallId: toolCall.id,
    tokensIn: 0,
    tokensOut: 0,
  });

  // Notify user of tool result
  await sock.sendMessage(jid, {
    text: `🔧 Tool \`${name}\` result:\n\`\`\`\n${result.slice(0, 3000)}\n\`\`\``
  });
}

function getMessageText(msg: proto.IWebMessageInfo): string | null {
  const message = msg.message;
  if (!message) return null;

  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;

  return null;
}

export async function startWhatsAppBot(): Promise<void> {
  console.log('📱 WhatsApp bot starting... (scan QR on first run)');
  await createWhatsAppBot();
  console.log('✅ WhatsApp bot running');
}