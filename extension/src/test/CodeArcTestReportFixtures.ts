import type { NormalizedTestCase } from '../application/LocalTestRunner';

export type ReportEvent = Record<string, unknown>;

export function reportText(events: ReportEvent[]): string {
	return events.map((event) => JSON.stringify(event)).join('\n');
}

export function runStarted(
	name = 'pytest',
	version = '9.1.1',
): ReportEvent {
	return { type: 'run_started', runner: { name, version } };
}

export function runFinished(exitCode: number): ReportEvent {
	return { type: 'run_finished', exitCode };
}

export function testIdentity(
	name: string,
	levelId = 'prefix-search',
	category: 'current' | 'regression' = 'current',
): Omit<NormalizedTestCase, 'status'> {
	return {
		name,
		testFunctionName: name.split('[', 1)[0],
		testPath: `.codearc/tests/${category}/${levelId}/test_search.py`,
		levelId,
		category,
	};
}

export function testStarted(
	testId: string,
	test: Omit<NormalizedTestCase, 'status'>,
): ReportEvent {
	return { type: 'test_started', testId, test };
}

export function testFinished(
	testId: string,
	test: NormalizedTestCase,
): ReportEvent {
	return { type: 'test_finished', testId, test };
}

export function passingTest(
	name: string,
	levelId = 'prefix-search',
	category: 'current' | 'regression' = 'current',
): NormalizedTestCase {
	return { ...testIdentity(name, levelId, category), status: 'passed' };
}

export function assertionFailure(
	name: string,
	levelId = 'single-term-search',
	category: 'current' | 'regression' = 'regression',
): NormalizedTestCase {
	return {
		...testIdentity(name, levelId, category),
		status: 'failed',
		failureKind: 'assertion',
		message: 'AssertionError: assert [] == [\'doc-1\']',
		comparison: { received: '[]', expected: '[\'doc-1\']' },
		traceback: '>       assert [] == [\'doc-1\']\nE       AssertionError',
	};
}

export function runFailed(
	withLearnerSource = true,
): ReportEvent {
	return {
		type: 'run_failed',
		message: 'SyntaxError: incomplete input',
		details: 'search_engine.py:7\nE   SyntaxError: incomplete input',
		...(withLearnerSource
			? { sourcePath: 'search_engine.py', sourceLine: 7 }
			: {}),
	};
}
