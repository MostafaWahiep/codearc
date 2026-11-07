import type {
	NormalizedTestCase,
	TestCaseFailureKind,
	TestEvidence,
	TestRunError,
	TestRunOutcome,
} from '../application/LocalTestRunner';
import type { ProcessResult } from './ProcessExecutor';

type TestIdentity = Pick<
	NormalizedTestCase,
	'name' | 'testFunctionName' | 'testPath' | 'levelId' | 'category'
>;

interface RunStartedEvent {
	type: 'run_started';
	runner: {
		name: string;
		version: string;
	};
}

interface RunFinishedEvent {
	type: 'run_finished';
	exitCode: number;
}

interface TestStartedEvent {
	type: 'test_started';
	testId: string;
	test: TestIdentity;
}

interface TestFinishedEvent {
	type: 'test_finished';
	testId: string;
	test: NormalizedTestCase;
}

interface RunFailedEvent extends TestRunError {
	type: 'run_failed';
}

type ReportEvent =
	| RunStartedEvent
	| RunFinishedEvent
	| TestStartedEvent
	| TestFinishedEvent
	| RunFailedEvent;

export interface CodeArcTestReportInput {
	reportText?: string;
	result: ProcessResult;
	codeHash: string;
	durationMilliseconds: number;
}

export function readCodeArcTestReport(
	input: CodeArcTestReportInput,
): TestEvidence {
	if (!input.reportText) {
		return emptyEvidence(
			input,
			input.result.timedOut ? 'timed_out' : 'runner_error',
			missingReportError(input.result.timedOut, input.result),
		);
	}

	let events: ReportEvent[];
	try {
		events = parseReport(input.reportText, input.result.timedOut);
	} catch (error) {
		return emptyEvidence(input, 'runner_error', {
			message: 'CodeArc could not read the test report.',
			details: error instanceof Error ? error.message : String(error),
		});
	}

	const started = new Map<string, TestIdentity>();
	const testCases: NormalizedTestCase[] = [];
	let runnerVersion = 'Unknown runner';
	let reportedExitCode: number | undefined;
	let runFailure: RunFailedEvent | undefined;

	for (const event of events) {
		switch (event.type) {
			case 'run_started':
				runnerVersion = `${event.runner.name} ${event.runner.version}`;
				break;
			case 'run_finished':
				reportedExitCode = event.exitCode;
				break;
			case 'test_started':
				started.set(event.testId, event.test);
				break;
			case 'test_finished':
				started.delete(event.testId);
				testCases.push(event.test);
				break;
			case 'run_failed':
				runFailure ??= event;
				break;
		}
	}

	if (input.result.timedOut) {
		for (const test of started.values()) {
			testCases.push({
				...test,
				status: 'failed',
				failureKind: 'timed_out',
				message: 'This test did not finish before CodeArc’s time limit.',
			});
		}
	}

	const failures = testCases.filter((testCase) => testCase.status === 'failed');
	const exitCode = input.result.exitCode ?? reportedExitCode ?? null;
	const outcome = classifyOutcome(
		input.result,
		exitCode,
		testCases,
		runFailure,
	);
	const runError = createRunError(
		outcome,
		runFailure,
		testCases,
		input.result,
	);

	return {
		outcome,
		passedCount: testCases.length - failures.length,
		failedCount: failures.length,
		totalCount: testCases.length,
		failures,
		testCases,
		runError,
		exitCode,
		timedOut: input.result.timedOut,
		runnerVersion,
		codeHash: input.codeHash,
		durationMilliseconds: input.durationMilliseconds,
	};
}

function parseReport(value: string, tolerateTruncatedLastLine: boolean): ReportEvent[] {
	const lines = value.split(/\r?\n/).filter((line) => line.trim().length > 0);
	const events: ReportEvent[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(lines[index]);
		} catch {
			if (tolerateTruncatedLastLine && index === lines.length - 1) {
				break;
			}
			throw new Error(`Report line ${index + 1} is not valid JSON.`);
		}
		const event = readEvent(parsed, index + 1);
		if (event) {
			events.push(event);
		}
	}
	return events;
}

function readEvent(value: unknown, line: number): ReportEvent | undefined {
	const event = record(value, `Report line ${line}`);
	const type = stringProperty(event, 'type', line);
	switch (type) {
		case 'run_started': {
			const runner = record(event.runner, `Runner on report line ${line}`);
			return {
				type,
				runner: {
					name: stringProperty(runner, 'name', line),
					version: stringProperty(runner, 'version', line),
				},
			};
		}
		case 'run_finished':
			return { type, exitCode: numberProperty(event, 'exitCode', line) };
		case 'test_started':
			return {
				type,
				testId: stringProperty(event, 'testId', line),
				test: readTestIdentity(event.test, line),
			};
		case 'test_finished':
			return {
				type,
				testId: stringProperty(event, 'testId', line),
				test: readTestResult(event.test, line),
			};
		case 'run_failed':
			return {
				type,
				message: stringProperty(event, 'message', line),
				details: stringProperty(event, 'details', line),
				sourcePath: optionalString(event.sourcePath),
				sourceLine: optionalNumber(event.sourceLine),
			};
		default:
			return undefined;
	}
}

function readTestIdentity(value: unknown, line: number): TestIdentity {
	const test = record(value, `Test identity on report line ${line}`);
	const category = stringProperty(test, 'category', line);
	if (category !== 'current' && category !== 'regression') {
		throw new Error(`Report line ${line} has an invalid test category.`);
	}
	return {
		name: stringProperty(test, 'name', line),
		testFunctionName: stringProperty(test, 'testFunctionName', line),
		testPath: stringProperty(test, 'testPath', line),
		levelId: stringProperty(test, 'levelId', line),
		category,
	};
}

function readTestResult(value: unknown, line: number): NormalizedTestCase {
	const test = record(value, `Test result on report line ${line}`);
	const identity = readTestIdentity(test, line);
	const status = stringProperty(test, 'status', line);
	if (status !== 'passed' && status !== 'failed') {
		throw new Error(`Report line ${line} has an invalid test status.`);
	}
	const rawFailureKind = optionalString(test.failureKind);
	let failureKind: TestCaseFailureKind | undefined;
	if (rawFailureKind !== undefined) {
		if (!isFailureKind(rawFailureKind)) {
			throw new Error(`Report line ${line} has an invalid failure kind.`);
		}
		failureKind = rawFailureKind;
	}
	const result: NormalizedTestCase = {
		...identity,
		status,
	};
	if (failureKind) {
		result.failureKind = failureKind;
	}
	assignOptional(result, 'message', optionalString(test.message));
	assignOptional(result, 'comparison', readComparison(test.comparison));
	assignOptional(result, 'traceback', optionalString(test.traceback));
	assignOptional(result, 'sourcePath', optionalString(test.sourcePath));
	assignOptional(result, 'sourceLine', optionalNumber(test.sourceLine));
	assignOptional(result, 'stdout', optionalString(test.stdout));
	return result;
}

function readComparison(
	value: unknown,
): NormalizedTestCase['comparison'] {
	if (value === undefined) {
		return undefined;
	}
	const comparison = record(value, 'Test comparison');
	return {
		received: requiredString(comparison.received, 'Test comparison received value'),
		expected: requiredString(comparison.expected, 'Test comparison expected value'),
	};
}

function classifyOutcome(
	result: ProcessResult,
	exitCode: number | null,
	testCases: NormalizedTestCase[],
	runFailure: RunFailedEvent | undefined,
): TestRunOutcome {
	if (result.timedOut) {
		return 'timed_out';
	}
	if (runFailure) {
		return runFailure.sourcePath ? 'code_error' : 'runner_error';
	}
	if (exitCode === 0 && testCases.length > 0) {
		return testCases.every((testCase) => testCase.status === 'passed')
			? 'passed'
			: 'test_failures';
	}
	return exitCode === 1 && testCases.length > 0
		? 'test_failures'
		: 'runner_error';
}

function createRunError(
	outcome: TestRunOutcome,
	runFailure: RunFailedEvent | undefined,
	testCases: NormalizedTestCase[],
	result: ProcessResult,
): TestRunError | undefined {
	if (outcome === 'passed' || outcome === 'test_failures') {
		return undefined;
	}
	if (outcome === 'timed_out') {
		return testCases.some((testCase) => testCase.failureKind === 'timed_out')
			? undefined
			: missingReportError(true, result);
	}
	if (runFailure) {
		return {
			message: runFailure.message,
			details: runFailure.details,
			sourcePath: runFailure.sourcePath,
			sourceLine: runFailure.sourceLine,
		};
	}
	return {
		message: 'The test runner could not complete the run.',
		details: processOutput(result)
			|| 'The runner exited without producing a usable CodeArc report.',
	};
}

function missingReportError(timedOut: boolean, result: ProcessResult): TestRunError {
	if (timedOut) {
		return {
			message: 'The test runner did not finish before the time limit.',
			details: 'The runner stopped before it reported which test was still running.',
		};
	}
	return {
		message: 'The test runner could not complete the run.',
		details: processOutput(result) || 'The runner did not produce a CodeArc report.',
	};
}

function emptyEvidence(
	input: CodeArcTestReportInput,
	outcome: TestRunOutcome,
	runError: TestRunError,
): TestEvidence {
	return {
		outcome,
		passedCount: 0,
		failedCount: 0,
		totalCount: 0,
		failures: [],
		testCases: [],
		runError,
		exitCode: input.result.exitCode,
		timedOut: input.result.timedOut,
		runnerVersion: 'Unknown runner',
		codeHash: input.codeHash,
		durationMilliseconds: input.durationMilliseconds,
	};
}

function processOutput(result: ProcessResult): string {
	return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n');
}

function isFailureKind(value: string): value is TestCaseFailureKind {
	return ['assertion', 'learner_error', 'test_error', 'timed_out'].includes(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${label} is not an object.`);
	}
	return value as Record<string, unknown>;
}

function stringProperty(
	value: Record<string, unknown>,
	key: string,
	line: number,
): string {
	return requiredString(value[key], `Report line ${line} property ${key}`);
}

function numberProperty(
	value: Record<string, unknown>,
	key: string,
	line: number,
): number {
	const property = value[key];
	if (typeof property !== 'number' || !Number.isFinite(property)) {
		throw new Error(`Report line ${line} property ${key} is not a number.`);
	}
	return property;
}

function requiredString(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new Error(`${label} is not a string.`);
	}
	return value;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function assignOptional<
	T extends object,
	K extends keyof T,
>(target: T, key: K, value: T[K] | undefined): void {
	if (value !== undefined) {
		target[key] = value;
	}
}
