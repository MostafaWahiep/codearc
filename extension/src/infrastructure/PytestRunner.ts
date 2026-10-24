import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BackendClient } from '../backend/BackendClient';
import type { PublicTestBundleDto } from '../backend/BackendTypes';
import type {
	LocalTestRunner,
	LocalTestRunRequest,
	NormalizedTestCase,
	TestEvidence,
} from '../application/LocalTestRunner';

export interface CommandResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

export type CommandExecutor = (
	command: string,
	args: string[],
	options: { cwd: string; timeoutMilliseconds: number },
) => Promise<CommandResult>;

export class PytestRunner implements LocalTestRunner {
	private running = false;

	public constructor(
		private readonly backendClient: BackendClient,
		private readonly execute: CommandExecutor = executeCommand,
		private readonly timeoutMilliseconds = 30_000,
	) {}

	public async run(request: LocalTestRunRequest): Promise<TestEvidence> {
		if (this.running) {
			throw new Error('A CodeArc test run is already in progress.');
		}
		this.running = true;
		const startedAt = Date.now();

		try {
			await ensureDirectory(request.workspacePath);
			const bundle = await this.backendClient.getVisibleTests(request.attemptId);
			const testsPath = await materializeTests(request.workspacePath, bundle);
			const python = await this.findPython(
				request.environmentPath,
				request.workspacePath,
			);
			const versionResult = await this.execute(
				python,
				['-m', 'pytest', '--version'],
				{
					cwd: request.workspacePath,
					timeoutMilliseconds: this.timeoutMilliseconds,
				},
			);
			if (versionResult.exitCode !== 0) {
				throw new Error(
					'pytest is not available. Install it with `python3 -m pip install pytest`.',
				);
			}

			const codeHash = await hashLearnerCode(request.workspacePath);
			const result = await this.execute(
				python,
				[
					'-m',
					'pytest',
					'-vv',
					'--color=no',
					'--tb=short',
					testsPath,
				],
				{
					cwd: request.workspacePath,
					timeoutMilliseconds: this.timeoutMilliseconds,
				},
			);

			return normalizeEvidence(
				result,
				versionResult.stdout.trim() || versionResult.stderr.trim(),
				codeHash,
				Date.now() - startedAt,
			);
		} finally {
			this.running = false;
		}
	}

	private async findPython(environmentPath: string, cwd: string): Promise<string> {
		const workspaceInterpreters = process.platform === 'win32'
			? [
				path.join(environmentPath, '.venv', 'Scripts', 'python.exe'),
				path.join(environmentPath, 'venv', 'Scripts', 'python.exe'),
			]
			: [
				path.join(environmentPath, '.venv', 'bin', 'python'),
				path.join(environmentPath, 'venv', 'bin', 'python'),
			];
		for (const command of [...workspaceInterpreters, 'python3', 'python']) {
			try {
				const result = await this.execute(command, ['--version'], {
					cwd,
					timeoutMilliseconds: 5_000,
				});
				if (result.exitCode === 0) {
					return command;
				}
			} catch {
				// Try the next standard Python command.
			}
		}
		throw new Error(
			'Python was not found. Install Python 3 and make `python3` available in PATH.',
		);
	}
}
async function ensureDirectory(workspacePath: string): Promise<void> {
	const stat = await fs.stat(workspacePath).catch(() => undefined);
	if (!stat?.isDirectory()) {
		throw new Error('Open or create the learner folder before running tests.');
	}
}

async function materializeTests(
	workspacePath: string,
	bundle: PublicTestBundleDto,
): Promise<string> {
	const testsRoot = path.join(workspacePath, '.codearc', 'tests');
	await fs.rm(testsRoot, { recursive: true, force: true });
	await fs.mkdir(testsRoot, { recursive: true });

	for (const file of bundle.files) {
		assertSafeSegment(file.levelId, 'level ID');
		const relativePath = path.join(file.category, file.levelId, file.path);
		const target = path.resolve(testsRoot, relativePath);
		if (!target.startsWith(`${path.resolve(testsRoot)}${path.sep}`)) {
			throw new Error(`Unsafe public test path: ${file.path}`);
		}
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, file.content, 'utf8');
	}

	return testsRoot;
}

function assertSafeSegment(value: string, label: string): void {
	if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
		throw new Error(`Unsafe public test ${label}: ${value}`);
	}
}

async function hashLearnerCode(workspacePath: string): Promise<string> {
	const files = await listPythonFiles(workspacePath);
	const hash = createHash('sha256');
	for (const file of files) {
		hash.update(path.relative(workspacePath, file));
		hash.update('\0');
		hash.update(await fs.readFile(file));
		hash.update('\0');
	}
	return hash.digest('hex');
}

async function listPythonFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const ignoredDirectories = new Set([
		'.codearc',
		'.git',
		'.pytest_cache',
		'.venv',
		'__pycache__',
		'node_modules',
		'venv',
	]);
	async function visit(directory: string): Promise<void> {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			if (ignoredDirectories.has(entry.name)) {
				continue;
			}
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(entryPath);
			} else if (entry.isFile() && entry.name.endsWith('.py')) {
				files.push(entryPath);
			}
		}
	}
	await visit(root);
	return files.sort();
}

function normalizeEvidence(
	result: CommandResult,
	runnerVersion: string,
	codeHash: string,
	durationMilliseconds: number,
): TestEvidence {
	const output = `${result.stdout}\n${result.stderr}`;
	const testCases: NormalizedTestCase[] = [];
	const casePattern = /^(.+?)::([^\s]+)\s+(PASSED|FAILED|ERROR)(?:\s+\[[^\]]+\])?$/gm;
	for (const match of output.matchAll(casePattern)) {
		const filePath = match[1];
		const status = match[3] === 'PASSED' ? 'passed' : 'failed';
		const category = filePath.includes(`${path.sep}regression${path.sep}`)
			|| filePath.includes('/regression/')
			? 'regression'
			: 'current';
		const pathParts = filePath.split(/[\\/]/);
		const categoryIndex = pathParts.lastIndexOf(category);
		const levelId = categoryIndex >= 0 ? pathParts[categoryIndex + 1] : 'unknown';
		testCases.push({
			name: match[2],
			levelId,
			category,
			status,
			details: status === 'failed' ? failureSummary(output, match[2]) : undefined,
		});
	}

	if (testCases.length === 0 && result.exitCode !== 0) {
		testCases.push({
			name: result.timedOut ? 'pytest timed out' : 'pytest execution',
			levelId: 'unknown',
			category: 'current',
			status: 'failed',
			details: output.trim() || 'pytest exited without reporting test cases.',
		});
	}

	const failures = testCases.filter((testCase) => testCase.status === 'failed');
	const passedCount = testCases.length - failures.length;
	return {
		passed: result.exitCode === 0 && !result.timedOut,
		passedCount,
		failedCount: failures.length,
		totalCount: testCases.length,
		failures,
		testCases,
		exitCode: result.exitCode,
		timedOut: result.timedOut,
		runnerVersion,
		codeHash,
		durationMilliseconds,
	};
}

function failureSummary(output: string, testName: string): string | undefined {
	const line = output.split(/\r?\n/).find(
		(candidate) => /^(FAILED|ERROR) /.test(candidate) && candidate.includes(testName),
	);
	return line?.replace(/^(FAILED|ERROR)\s+/, '');
}

function executeCommand(
	command: string,
	args: string[],
	options: { cwd: string; timeoutMilliseconds: number },
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
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
}
