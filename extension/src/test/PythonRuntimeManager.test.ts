import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
	ProcessExecutor,
	ProcessResult,
} from '../infrastructure/ProcessExecutor';
import { PythonRuntimeManager } from '../infrastructure/PythonRuntimeManager';

suite('PythonRuntimeManager', () => {
	let storagePath: string;
	let runtimeRoot: string;
	let requirementsPath: string;

	setup(async () => {
		storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'codearc-python-runtime-'));
		runtimeRoot = path.join(storagePath, 'runtime');
		requirementsPath = path.join(storagePath, 'requirements.txt');
		await fs.writeFile(requirementsPath, 'pytest==9.1.1\n', 'utf8');
	});

	teardown(async () => {
		await fs.rm(storagePath, { recursive: true, force: true });
	});

	test('creates the shared environment and installs its requirements', async () => {
		const python = runtimePython(runtimeRoot);
		let runtimeExists = false;
		const calls: ProcessCall[] = [];
		const execute: ProcessExecutor = async (command, args) => {
			calls.push({ command, args });
			if (command === python && args[0] === '--version') {
				return processResult(runtimeExists ? 0 : 1);
			}
			if (command === 'python3' && args[0] === '--version') {
				return processResult(0, 'Python 3.14.0\n');
			}
			if (command === 'python3' && args[1] === 'venv') {
				runtimeExists = true;
				return processResult(0);
			}
			if (command === python && args.includes('pip')) {
				return processResult(0);
			}
			throw new Error(`Unexpected process: ${command} ${args.join(' ')}`);
		};
		const manager = createManager(runtimeRoot, requirementsPath, execute);

		const result = await manager.ensureReady(storagePath);

		assert.strictEqual(result, python);
		assert.ok(calls.some(({ command, args }) =>
			command === 'python3'
			&& args.join(' ') === `-m venv ${path.join(runtimeRoot, '.venv')}`,
		));
		assert.ok(calls.some(({ command, args }) =>
			command === python
			&& args.join(' ') === `-m pip install --disable-pip-version-check -r ${requirementsPath}`,
		));
		assert.match(
			await fs.readFile(path.join(runtimeRoot, '.requirements.sha256'), 'utf8'),
			/^[a-f0-9]{64}\n$/,
		);
	});

	test('reuses the environment when its requirements have not changed', async () => {
		let installCount = 0;
		const python = runtimePython(runtimeRoot);
		const execute: ProcessExecutor = async (command, args) => {
			if (command === python && args[0] === '--version') {
				return processResult(0, 'Python 3.14.0\n');
			}
			if (command === python && args.includes('pip')) {
				installCount += 1;
				return processResult(0);
			}
			throw new Error(`Unexpected process: ${command} ${args.join(' ')}`);
		};
		const manager = createManager(runtimeRoot, requirementsPath, execute);

		await manager.ensureReady(storagePath);
		await manager.ensureReady(storagePath);

		assert.strictEqual(installCount, 1);
	});

	test('reinstalls dependencies when requirements change', async () => {
		let installCount = 0;
		const python = runtimePython(runtimeRoot);
		const execute: ProcessExecutor = async (command, args) => {
			if (command === python && args[0] === '--version') {
				return processResult(0, 'Python 3.14.0\n');
			}
			if (command === python && args.includes('pip')) {
				installCount += 1;
				return processResult(0);
			}
			throw new Error(`Unexpected process: ${command} ${args.join(' ')}`);
		};
		const manager = createManager(runtimeRoot, requirementsPath, execute);

		await manager.ensureReady(storagePath);
		await fs.writeFile(
			requirementsPath,
			'pytest==9.1.1\npytest-timeout==2.4.0\n',
			'utf8',
		);
		await manager.ensureReady(storagePath);

		assert.strictEqual(installCount, 2);
	});

	test('reports an actionable error when Python is missing', async () => {
		const execute: ProcessExecutor = async () => {
			throw new Error('ENOENT');
		};
		const manager = createManager(runtimeRoot, requirementsPath, execute);

		await assert.rejects(
			manager.ensureReady(storagePath),
			/Python was not found/,
		);
	});
});

interface ProcessCall {
	command: string;
	args: string[];
}

function createManager(
	runtimeRoot: string,
	requirementsPath: string,
	execute: ProcessExecutor,
): PythonRuntimeManager {
	return new PythonRuntimeManager(
		{ rootPath: runtimeRoot, requirementsPath },
		execute,
	);
}

function runtimePython(runtimeRoot: string): string {
	return process.platform === 'win32'
		? path.join(runtimeRoot, '.venv', 'Scripts', 'python.exe')
		: path.join(runtimeRoot, '.venv', 'bin', 'python');
}

function processResult(
	exitCode: number | null,
	stdout = '',
): ProcessResult {
	return {
		exitCode,
		stdout,
		stderr: '',
		timedOut: false,
	};
}
