import { spawn } from 'node:child_process';

export interface ProcessResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

export interface ProcessOptions {
	cwd: string;
	timeoutMilliseconds: number;
}

export type ProcessExecutor = (
	command: string,
	args: string[],
	options: ProcessOptions,
) => Promise<ProcessResult>;

export const executeProcess: ProcessExecutor = (
	command,
	args,
	options,
) => new Promise((resolve, reject) => {
	const child = spawn(command, args, {
		cwd: options.cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let stdout = '';
	let stderr = '';
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		child.kill('SIGKILL');
	}, options.timeoutMilliseconds);

	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', (chunk: string) => { stdout += chunk; });
	child.stderr.on('data', (chunk: string) => { stderr += chunk; });
	child.on('error', (error) => {
		clearTimeout(timeout);
		reject(error);
	});
	child.on('close', (exitCode) => {
		clearTimeout(timeout);
		resolve({ exitCode, stdout, stderr, timedOut });
	});
});
