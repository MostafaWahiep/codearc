import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BackendClient } from '../backend/BackendClient';
import type { PublicTestBundleDto } from '../backend/BackendTypes';
import type {
	ProcessExecutor,
	ProcessResult,
} from '../infrastructure/ProcessExecutor';
import { PytestRunner } from '../infrastructure/PytestRunner';
import type { PythonRuntime } from '../infrastructure/PythonRuntimeManager';

suite('PytestRunner', () => {
	let workspacePath: string;

	setup(async () => {
		workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'codearc-runner-'));
		await fs.writeFile(
			path.join(workspacePath, 'search_engine.py'),
			'class SearchEngine:\n    pass\n',
			'utf8',
		);
	});

	teardown(async () => {
		await fs.rm(workspacePath, { recursive: true, force: true });
	});

	test('materializes backend tests and normalizes current and regression evidence', async () => {
		const runner = new PytestRunner(
			createBackendClient(testBundle()),
			createPythonRuntime(),
			createSuccessfulExecutor(),
		);

		const evidence = await runner.run({
			attemptId: 'attempt-1',
			workspacePath,
		});

		assert.strictEqual(evidence.passed, false);
		assert.strictEqual(evidence.passedCount, 1);
		assert.strictEqual(evidence.failedCount, 1);
		assert.strictEqual(evidence.totalCount, 2);
		assert.strictEqual(evidence.exitCode, 1);
		assert.strictEqual(evidence.runnerVersion, 'pytest 9.0.0');
		assert.match(evidence.codeHash, /^[a-f0-9]{64}$/);
		assert.deepStrictEqual(
			evidence.testCases.map(({ name, levelId, category, status }) => ({
				name,
				levelId,
				category,
				status,
			})),
			[
				{
					name: 'test_prefix',
					levelId: 'prefix-search',
					category: 'current',
					status: 'passed',
				},
				{
					name: 'test_exact',
					levelId: 'single-term-search',
					category: 'regression',
					status: 'failed',
				},
			],
		);
		assert.strictEqual(
			await fs.readFile(
				path.join(
					workspacePath,
					'.codearc',
					'tests',
					'current',
					'prefix-search',
					'test_prefix.py',
				),
				'utf8',
			),
			'def test_prefix(): pass\n',
		);
	});

	test('changes the code hash when learner Python changes', async () => {
		const runner = new PytestRunner(
			createBackendClient(testBundle()),
			createPythonRuntime(),
			createPassingExecutor(),
		);
		const first = await runner.run({
			attemptId: 'attempt-1',
			workspacePath,
		});
		await fs.mkdir(path.join(workspacePath, '.venv'), { recursive: true });
		await fs.writeFile(path.join(workspacePath, '.venv', 'dependency.py'), 'ignored\n');
		const withEnvironment = await runner.run({
			attemptId: 'attempt-1',
			workspacePath,
		});
		await fs.appendFile(path.join(workspacePath, 'search_engine.py'), '# changed\n');

		const second = await runner.run({
			attemptId: 'attempt-1',
			workspacePath,
		});

		assert.strictEqual(first.codeHash, withEnvironment.codeHash);
		assert.notStrictEqual(first.codeHash, second.codeHash);
	});

	test('uses the runtime Python while running in the challenge root', async () => {
		const expectedPython = '/codearc/runtime/python';
		const calls: Array<{ command: string; cwd: string }> = [];
		const execute: ProcessExecutor = async (command, args, options) => {
			calls.push({ command, cwd: options.cwd });
			if (args.includes('--version')) {
				return commandResult(0, 'pytest 9.0.0\n');
			}
			return commandResult(0, testOutput('PASSED', 'PASSED'));
		};
		const runner = new PytestRunner(
			createBackendClient(testBundle()),
			createPythonRuntime(expectedPython),
			execute,
		);

		await runner.run({ attemptId: 'attempt-1', workspacePath });

		assert.ok(calls.length >= 2);
		assert.ok(calls.every((call) => call.command === expectedPython));
		assert.ok(calls.every((call) => call.cwd === workspacePath));
	});

	test('rejects a concurrent run', async () => {
		let releaseRun: ((result: ProcessResult) => void) | undefined;
		let markRunStarted: (() => void) | undefined;
		const runStarted = new Promise<void>((resolve) => { markRunStarted = resolve; });
		const execute: ProcessExecutor = async (_command, args) => {
			if (args.includes('--version')) {
				return commandResult(0, 'pytest 9.0.0\n');
			}
			if (args.includes('pytest')) {
				markRunStarted?.();
				return new Promise((resolve) => { releaseRun = resolve; });
			}
			return commandResult(0, 'Python 3.14.0\n');
		};
		const runner = new PytestRunner(
			createBackendClient(testBundle()),
			createPythonRuntime(),
			execute,
		);
		const firstRun = runner.run({
			attemptId: 'attempt-1',
			workspacePath,
		});
		await runStarted;

		await assert.rejects(
			runner.run({
				attemptId: 'attempt-1',
				workspacePath,
			}),
			/already in progress/,
		);
		releaseRun?.(commandResult(0, testOutput('PASSED', 'PASSED')));
		await firstRun;
	});

	test('captures timeout evidence', async () => {
		const execute: ProcessExecutor = async (_command, args) => {
			if (args.includes('--version')) {
				return commandResult(0, 'pytest 9.0.0\n');
			}
			if (args.includes('pytest')) {
				return { ...commandResult(null, ''), timedOut: true };
			}
			return commandResult(0, 'Python 3.14.0\n');
		};
		const runner = new PytestRunner(
			createBackendClient(testBundle()),
			createPythonRuntime(),
			execute,
		);

		const evidence = await runner.run({
			attemptId: 'attempt-1',
			workspacePath,
		});

		assert.strictEqual(evidence.passed, false);
		assert.strictEqual(evidence.timedOut, true);
		assert.strictEqual(evidence.exitCode, null);
		assert.strictEqual(evidence.failures[0].name, 'pytest timed out');
	});
});

function createPythonRuntime(
	pythonPath = '/codearc/runtime/python',
): PythonRuntime {
	return {
		ensureReady: async () => pythonPath,
	};
}

function createBackendClient(bundle: PublicTestBundleDto): BackendClient {
	return {
		listChallenges: async () => [],
		listAttempts: async () => [],
		startAttempt: async () => { throw new Error('Not used'); },
		getAttempt: async () => { throw new Error('Not used'); },
		getVisibleLevel: async () => { throw new Error('Not used'); },
		getVisibleTests: async () => bundle,
		submitTestResults: async () => {
			throw new Error('Not used');
		},
		getStarterFiles: async () => {
			throw new Error('Not implemented by this test fake.');
		},
	};
}

function testBundle(): PublicTestBundleDto {
	return {
		runner: 'pytest',
		files: [
			{
				levelId: 'prefix-search',
				path: 'test_prefix.py',
				content: 'def test_prefix(): pass\n',
				category: 'current',
			},
			{
				levelId: 'single-term-search',
				path: 'test_search.py',
				content: 'def test_exact(): pass\n',
				category: 'regression',
			},
		],
	};
}

function createSuccessfulExecutor(): ProcessExecutor {
	return async (_command, args) => {
		if (args.includes('--version')) {
			return commandResult(0, 'pytest 9.0.0\n');
		}
		if (args.includes('pytest')) {
			return commandResult(1, testOutput('PASSED', 'FAILED'));
		}
		return commandResult(0, 'Python 3.14.0\n');
	};
}

function createPassingExecutor(): ProcessExecutor {
	return async (_command, args) => {
		if (args.includes('--version')) {
			return commandResult(0, 'pytest 9.0.0\n');
		}
		if (args.includes('pytest')) {
			return commandResult(0, testOutput('PASSED', 'PASSED'));
		}
		return commandResult(0, 'Python 3.14.0\n');
	};
}

function testOutput(current: 'PASSED' | 'FAILED', regression: 'PASSED' | 'FAILED'): string {
	return [
		`.codearc/tests/current/prefix-search/test_prefix.py::test_prefix ${current} [ 50%]`,
		`.codearc/tests/regression/single-term-search/test_search.py::test_exact ${regression} [100%]`,
		regression === 'FAILED'
			? 'FAILED .codearc/tests/regression/single-term-search/test_search.py::test_exact - AssertionError'
			: '',
	].join('\n');
}

function commandResult(exitCode: number | null, stdout: string): ProcessResult {
	return {
		exitCode,
		stdout,
		stderr: '',
		timedOut: false,
	};
}
