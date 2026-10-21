import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BackendClient } from '../backend/BackendClient';
import type { PublicTestBundleDto } from '../backend/BackendTypes';
import {
	PytestRunner,
	type CommandExecutor,
	type CommandResult,
} from '../infrastructure/PytestRunner';

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
			createPassingExecutor(),
		);
		const first = await runner.run({ attemptId: 'attempt-1', workspacePath });
		await fs.mkdir(path.join(workspacePath, '.venv'), { recursive: true });
		await fs.writeFile(path.join(workspacePath, '.venv', 'dependency.py'), 'ignored\n');
		const withEnvironment = await runner.run({
			attemptId: 'attempt-1',
			workspacePath,
		});
		await fs.appendFile(path.join(workspacePath, 'search_engine.py'), '# changed\n');

		const second = await runner.run({ attemptId: 'attempt-1', workspacePath });

		assert.strictEqual(first.codeHash, withEnvironment.codeHash);
		assert.notStrictEqual(first.codeHash, second.codeHash);
	});

	test('reports an actionable error when Python is missing', async () => {
		const execute: CommandExecutor = async () => {
			throw new Error('ENOENT');
		};
		const runner = new PytestRunner(createBackendClient(testBundle()), execute);

		await assert.rejects(
			runner.run({ attemptId: 'attempt-1', workspacePath }),
			/Python was not found/,
		);
	});

	test('rejects a concurrent run', async () => {
		let releaseRun: ((result: CommandResult) => void) | undefined;
		let markRunStarted: (() => void) | undefined;
		const runStarted = new Promise<void>((resolve) => { markRunStarted = resolve; });
		const execute: CommandExecutor = async (_command, args) => {
			if (args.includes('--version')) {
				return commandResult(0, 'pytest 9.0.0\n');
			}
			if (args.includes('pytest')) {
				markRunStarted?.();
				return new Promise((resolve) => { releaseRun = resolve; });
			}
			return commandResult(0, 'Python 3.14.0\n');
		};
		const runner = new PytestRunner(createBackendClient(testBundle()), execute);
		const firstRun = runner.run({ attemptId: 'attempt-1', workspacePath });
		await runStarted;

		await assert.rejects(
			runner.run({ attemptId: 'attempt-1', workspacePath }),
			/already in progress/,
		);
		releaseRun?.(commandResult(0, testOutput('PASSED', 'PASSED')));
		await firstRun;
	});

	test('captures timeout evidence', async () => {
		const execute: CommandExecutor = async (_command, args) => {
			if (args.includes('--version')) {
				return commandResult(0, 'pytest 9.0.0\n');
			}
			if (args.includes('pytest')) {
				return { ...commandResult(null, ''), timedOut: true };
			}
			return commandResult(0, 'Python 3.14.0\n');
		};
		const runner = new PytestRunner(createBackendClient(testBundle()), execute);

		const evidence = await runner.run({ attemptId: 'attempt-1', workspacePath });

		assert.strictEqual(evidence.passed, false);
		assert.strictEqual(evidence.timedOut, true);
		assert.strictEqual(evidence.exitCode, null);
		assert.strictEqual(evidence.failures[0].name, 'pytest timed out');
	});
});

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
		}
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

function createSuccessfulExecutor(): CommandExecutor {
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

function createPassingExecutor(): CommandExecutor {
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

function commandResult(exitCode: number | null, stdout: string): CommandResult {
	return {
		exitCode,
		stdout,
		stderr: '',
		timedOut: false,
	};
}
