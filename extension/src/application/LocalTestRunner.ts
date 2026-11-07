export interface LocalTestRunRequest {
	attemptId: string;
	workspacePath: string;
}

export type TestRunOutcome =
	| 'passed'
	| 'test_failures'
	| 'code_error'
	| 'runner_error'
	| 'timed_out';

export type TestCaseFailureKind =
	| 'assertion'
	| 'learner_error'
	| 'test_error'
	| 'timed_out';

export interface TestFailureComparison {
	received: string;
	expected: string;
}

export interface NormalizedTestCase {
	name: string;
	testFunctionName?: string;
	testPath?: string;
	levelId: string;
	category: 'current' | 'regression';
	status: 'passed' | 'failed';
	failureKind?: TestCaseFailureKind;
	message?: string;
	comparison?: TestFailureComparison;
	traceback?: string;
	sourcePath?: string;
	sourceLine?: number;
	stdout?: string;
}

export interface TestRunError {
	message: string;
	details: string;
	sourcePath?: string;
	sourceLine?: number;
}

export interface TestEvidence {
	outcome: TestRunOutcome;
	passedCount: number;
	failedCount: number;
	totalCount: number;
	failures: NormalizedTestCase[];
	testCases: NormalizedTestCase[];
	runError?: TestRunError;
	exitCode: number | null;
	timedOut: boolean;
	runnerVersion: string;
	codeHash: string;
	durationMilliseconds: number;
}

export interface LocalTestRunner {
	run(request: LocalTestRunRequest): Promise<TestEvidence>;
}
