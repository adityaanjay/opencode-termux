import { spawn } from 'child_process';
import { resolve } from 'path';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function runCommand(
  command: string,
  cwd = process.cwd(),
  timeout = 30000
): Promise<CommandResult> {
  const resolvedCwd = resolve(cwd);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: resolvedCwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let exited = false;

    const killTimer = setTimeout(() => {
      if (!exited) {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
        stdout += '\n[Command timed out]';
        exited = true;
        resolvePromise({
          stdout,
          stderr: stderr + '\n[Timeout]',
          exitCode: -1,
        });
      }
    }, timeout);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (exited) return;
      clearTimeout(killTimer);
      exited = true;
      resolvePromise({
        stdout,
        stderr,
        exitCode: code,
      });
    });

    child.on('error', (error) => {
      if (exited) return;
      clearTimeout(killTimer);
      exited = true;
      reject(error);
    });
  });
}

export async function runCommandStreaming(
  command: string,
  cwd = process.cwd(),
  onStdout?: (data: string) => void,
  onStderr?: (data: string) => void
): Promise<CommandResult> {
  const resolvedCwd = resolve(cwd);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: resolvedCwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      onStdout?.(str);
    });

    child.stderr?.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      onStderr?.(str);
    });

    child.on('close', (code) => {
      resolvePromise({
        stdout,
        stderr,
        exitCode: code,
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}