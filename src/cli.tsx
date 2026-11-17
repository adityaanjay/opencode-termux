#!/usr/bin/env bun
import { render } from 'ink';
import App from './App.js';

// Check if we're in a TTY environment
const isTTY = process.stdin.isTTY && process.stdout.isTTY;

if (!isTTY) {
  console.log('opencode-termux requires a TTY environment (like Termux) to run.');
  console.log('Run it directly in your terminal: opencode-termux');
  process.exit(1);
}

render(<App />);

process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});