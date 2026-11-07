import * as assert from 'node:assert';
import type { ProcessResult } from '../infrastructure/ProcessExecutor';
import { readCodeArcTestReport } from '../infrastructure/CodeArcTestReport';
import {
	assertionFailure,
	passingTest,
	reportText,
	runFailed,
	runFinished,
	runStarted,
	testFinished,
	testIdentity,
	testStarted,
	type ReportEvent,
} from './CodeArcTestReportFixtures';

suite('CodeArcTestReport', () => {
	test('maps current and regression results', () => {
		const current = passingTest('test_prefix');
		const regression = assertionFailure('test_exact');
		const evidence = map([
			runStarted(),
			testFinished('current', current),
			testFinished('regression', regression),
			runFinished(1),
		], 1);

		assert.strictEqual(evidence.outcome, 'test_failures');
		assert.strictEqual(evidence.passedCount, 1);
		assert.strictEqual(evidence.failedCount, 1);
		assert.deepStrictEqual(evidence.failures[0].comparison, {
			received: '[]',
			expected: '[\'doc-1\']',
		});
		assert.strictEqual(evidence.runnerVersion, 'pytest 9.1.1');
	});

	test('preserves normalized learner errors from the Python adapter', () => {
		const failed = {
			...testIdentity('test_divides'),
			status: 'failed' as const,
			failureKind: 'learner_error' as const,
			message: 'ZeroDivisionError: division by zero',
			traceback: 'search_engine.py:39: ZeroDivisionError',
			sourcePath: 'search_engine.py',
			sourceLine: 39,
			stdout: 'dividing 2 by 0\n',
		};
		const evidence = map([
			testFinished('divide', failed),
			runFinished(1),
		], 1);

		assert.deepStrictEqual(evidence.failures[0], failed);
	});

	test('classifies run failures using the adapter source location', () => {
		const learnerError = map([runFailed(true), runFinished(2)], 2);
		const testError = map([runFailed(false), runFinished(2)], 2);

		assert.strictEqual(learnerError.outcome, 'code_error');
		assert.strictEqual(learnerError.runError?.sourcePath, 'search_engine.py');
		assert.strictEqual(testError.outcome, 'runner_error');
	});

	test('uses non-test exit statuses as runner errors', () => {
		const evidence = map([
			testFinished('prefix', passingTest('test_prefix')),
			runFinished(3),
		], 3);

		assert.strictEqual(evidence.totalCount, 1);
		assert.strictEqual(evidence.outcome, 'runner_error');
	});

	test('attributes a process timeout to the active test', () => {
		const completed = passingTest('test_prefix');
		const active = testIdentity('test_hangs');
		const evidence = map([
			testFinished('completed', completed),
			testStarted('active', active),
		], null, true);

		assert.strictEqual(evidence.outcome, 'timed_out');
		assert.strictEqual(evidence.passedCount, 1);
		assert.strictEqual(evidence.failedCount, 1);
		assert.strictEqual(evidence.failures[0].name, 'test_hangs');
		assert.strictEqual(evidence.failures[0].failureKind, 'timed_out');
		assert.strictEqual(evidence.runError, undefined);
	});

	test('keeps valid events when a timed-out run truncates its final line', () => {
		const completeLine = reportText([
			testStarted('active', testIdentity('test_hangs')),
		]);
		const evidence = mapRaw(`${completeLine}\n{"type":`, null, true);

		assert.strictEqual(evidence.failures[0].name, 'test_hangs');
		assert.strictEqual(evidence.failures[0].failureKind, 'timed_out');
	});

	test('rejects malformed interior report lines', () => {
		const evidence = mapRaw([
			JSON.stringify(runStarted()),
			'{not-json',
			JSON.stringify(runFinished(3)),
		].join('\n'), 3, true);

		assert.strictEqual(evidence.outcome, 'runner_error');
		assert.strictEqual(
			evidence.runError?.message,
			'CodeArc could not read the test report.',
		);
	});

	test('ignores future event types and properties', () => {
		const evidence = map([
			{ type: 'future_event', value: true },
			{ ...runStarted(), futureProperty: true },
			testFinished('prefix', passingTest('test_prefix')),
			runFinished(0),
		], 0);

		assert.strictEqual(evidence.outcome, 'passed');
	});

	test('does not show terminal progress when a timeout has no report', () => {
		const evidence = readCodeArcTestReport({
			result: processResult(null, true, 'F.....FFFF..'),
			codeHash: 'abc123',
			durationMilliseconds: 30_000,
		});

		assert.strictEqual(evidence.outcome, 'timed_out');
		assert.doesNotMatch(evidence.runError?.details ?? '', /F\.\.\./);
	});
});

function map(
	events: ReportEvent[],
	exitCode: number | null,
	timedOut = false,
) {
	return mapRaw(reportText(events), exitCode, timedOut);
}

function mapRaw(value: string, exitCode: number | null, timedOut = false) {
	return readCodeArcTestReport({
		reportText: value,
		result: processResult(exitCode, timedOut),
		codeHash: 'abc123',
		durationMilliseconds: 20,
	});
}

function processResult(
	exitCode: number | null,
	timedOut: boolean,
	stdout = '',
): ProcessResult {
	return { exitCode, timedOut, stdout, stderr: '' };
}
