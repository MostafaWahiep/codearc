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
import {
	assertionFailure,
	passingTest,
	reportText,
	runFinished,
	runStarted,
	testFinished,
	type ReportEvent,
} from './CodeArcTestReportFixtures';

suite('PytestRunner', () => {
	const runnerScriptPath = '/codearc/codearc_pytest_runner.py';
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

	test('materializes backend tests and reads normalized evidence', async () => {
		const runner = createRunner(executorWithReport([
			runStarted(),
			testFinished('current', passingTest('test_prefix')),
			testFinished('regression', assertionFailure('test_exact')),
			runFinished(1),
		], 1));

		const evidence = await runner.run({
			attemptId: 'attempt-1',
			workspacePath,
		});

		assert.strictEqual(evidence.outcome, 'test_failures');
		assert.strictEqual(evidence.passedCount, 1);
		assert.strictEqual(evidence.failedCount, 1);
		assert.strictEqual(evidence.runnerVersion, 'pytest 9.1.1');
		assert.match(evidence.codeHash, /^[a-f0-9]{64}$/);
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

	test('changes the code hash only when learner Python changes', async () => {
		const runner = createRunner(executorWithReport([
			runStarted(),
			testFinished('prefix', passingTest('test_prefix')),
			runFinished(0),
		], 0));
		const first = await runner.run({ attemptId: 'attempt-1', workspacePath });
		await fs.mkdir(path.join(workspacePath, '.venv'), { recursive: true });
		await fs.writeFile(path.join(workspacePath, '.venv', 'dependency.py'), 'ignored\n');
		const withEnvironment = await runner.run({ attemptId: 'attempt-1', workspacePath });
		await fs.appendFile(path.join(workspacePath, 'search_engine.py'), '# changed\n');
		const changed = await runner.run({ attemptId: 'attempt-1', workspacePath });

		assert.strictEqual(first.codeHash, withEnvironment.codeHash);
		assert.notStrictEqual(first.codeHash, changed.codeHash);
	});

	test('executes the bundled adapter with the runtime Python', async () => {
		const expectedPython = '/codearc/runtime/python';
		const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
		const execute: ProcessExecutor = async (command, args, options) => {
			calls.push({ command, args, cwd: options.cwd });
			await writeReport(args, [
				runStarted(),
				testFinished('prefix', passingTest('test_prefix')),
				runFinished(0),
			]);
			return processResult(0, '1 passed\n');
		};
		const runner = new PytestRunner(
			createBackendClient(testBundle()),
			createPythonRuntime(expectedPython),
			runnerScriptPath,
			execute,
		);

		await runner.run({ attemptId: 'attempt-1', workspacePath });

		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].command, expectedPython);
		assert.strictEqual(calls[0].args[0], runnerScriptPath);
		assert.strictEqual(calls[0].cwd, workspacePath);
		assert.strictEqual(argumentValue(calls[0].args, '--workspace'), workspacePath);
		assert.match(argumentValue(calls[0].args, '--tests'), /\.codearc\/tests$/);
	});

	test('rejects a concurrent run', async () => {
		let releaseRun: ((result: ProcessResult) => void) | undefined;
		let markStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => { markStarted = resolve; });
		const execute: ProcessExecutor = async (_command, args) => {
			await writeReport(args, [
				runStarted(),
				testFinished('prefix', passingTest('test_prefix')),
				runFinished(0),
			]);
			markStarted?.();
			return new Promise((resolve) => { releaseRun = resolve; });
		};
		const runner = createRunner(execute);
		const firstRun = runner.run({ attemptId: 'attempt-1', workspacePath });
		await started;

		await assert.rejects(
			runner.run({ attemptId: 'attempt-1', workspacePath }),
			/already in progress/,
		);
		releaseRun?.(processResult(0));
		await firstRun;
	});

	test('returns actionable timeout evidence when no report was written', async () => {
		const runner = createRunner(async () => ({
			...processResult(null, 'F.....'),
			timedOut: true,
		}));

		const evidence = await runner.run({ attemptId: 'attempt-1', workspacePath });

		assert.strictEqual(evidence.outcome, 'timed_out');
		assert.strictEqual(evidence.totalCount, 0);
		assert.strictEqual(
			evidence.runError?.details,
			'The runner stopped before it reported which test was still running.',
		);
	});

	test('surfaces adapter failures as runner errors', async () => {
		const runner = createRunner(async () => processResult(
			4,
			'',
			'Traceback: pytest could not start',
		));

		const evidence = await runner.run({ attemptId: 'attempt-1', workspacePath });

		assert.strictEqual(evidence.outcome, 'runner_error');
		assert.match(evidence.runError?.details ?? '', /pytest could not start/);
	});

	function createRunner(execute: ProcessExecutor): PytestRunner {
		return new PytestRunner(
			createBackendClient(testBundle()),
			createPythonRuntime(),
			runnerScriptPath,
			execute,
		);
	}
});

function createPythonRuntime(pythonPath = '/codearc/runtime/python'): PythonRuntime {
	return { ensureReady: async () => pythonPath };
}

function createBackendClient(bundle: PublicTestBundleDto): BackendClient {
	return {
		listChallenges: async () => [],
		listAttempts: async () => [],
		startAttempt: async () => { throw new Error('Not used'); },
		getAttempt: async () => { throw new Error('Not used'); },
		getVisibleLevel: async () => { throw new Error('Not used'); },
		getVisibleTests: async () => bundle,
		submitTestResults: async () => { throw new Error('Not used'); },
		getStarterFiles: async () => { throw new Error('Not used'); },
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

function executorWithReport(
	events: ReportEvent[],
	exitCode: number,
): ProcessExecutor {
	return async (_command, args) => {
		await writeReport(args, events);
		return processResult(exitCode);
	};
}

async function writeReport(args: string[], events: ReportEvent[]): Promise<void> {
	await fs.writeFile(argumentValue(args, '--report'), reportText(events), 'utf8');
}

function argumentValue(args: string[], option: string): string {
	const index = args.indexOf(option);
	assert.ok(index >= 0 && args[index + 1], `Expected ${option} argument.`);
	return args[index + 1];
}

function processResult(
	exitCode: number | null,
	stdout = '',
	stderr = '',
): ProcessResult {
	return { exitCode, stdout, stderr, timedOut: false };
}
