import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BackendClient } from '../backend/BackendClient';
import type { PublicTestBundleDto } from '../backend/BackendTypes';
import type {
	LocalTestRunner,
	LocalTestRunRequest,
	TestEvidence,
} from '../application/LocalTestRunner';
import {
	executeProcess,
	type ProcessExecutor,
} from './ProcessExecutor';
import { readCodeArcTestReport } from './CodeArcTestReport';
import type { PythonRuntime } from './PythonRuntimeManager';

export class PytestRunner implements LocalTestRunner {
	private running = false;

	public constructor(
		private readonly backendClient: BackendClient,
		private readonly runtime: PythonRuntime,
		private readonly runnerScriptPath: string,
		private readonly execute: ProcessExecutor = executeProcess,
		private readonly timeoutMilliseconds = 30_000,
	) {}

	public async run(request: LocalTestRunRequest): Promise<TestEvidence> {
		if (this.running) {
			throw new Error('A CodeArc test run is already in progress.');
		}
		this.running = true;
		const startedAt = Date.now();
		let reportPath: string | undefined;

		try {
			await ensureDirectory(request.workspacePath);
			const bundle = await this.backendClient.getVisibleTests(request.attemptId);
			const testsPath = await materializeTests(request.workspacePath, bundle);
			const python = await this.runtime.ensureReady(request.workspacePath);
			const codeHash = await hashLearnerCode(request.workspacePath);
			reportPath = path.join(
				request.workspacePath,
				'.codearc',
				'test-results',
				`pytest-${randomUUID()}.jsonl`,
			);
			await fs.mkdir(path.dirname(reportPath), { recursive: true });
			const result = await this.execute(
				python,
				[
					this.runnerScriptPath,
					'--report',
					reportPath,
					'--workspace',
					request.workspacePath,
					'--tests',
					testsPath,
				],
				{
					cwd: request.workspacePath,
					timeoutMilliseconds: this.timeoutMilliseconds,
				},
			);
			const reportText = await fs.readFile(reportPath, 'utf8').catch(
				(error: NodeJS.ErrnoException) => {
					if (error.code === 'ENOENT') {
						return undefined;
					}
					throw error;
				},
			);

			return readCodeArcTestReport({
				reportText,
				result,
				codeHash,
				durationMilliseconds: Date.now() - startedAt,
			});
		} finally {
			this.running = false;
		}
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
