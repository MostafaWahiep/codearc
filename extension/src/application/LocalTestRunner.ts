export interface LocalTestRunRequest {
	attemptId: string;
	workspacePath: string;
	environmentPath: string;
}

export interface NormalizedTestCase {
	name: string;
	levelId: string;
	category: 'current' | 'regression';
	status: 'passed' | 'failed';
	details?: string;
}

export interface TestEvidence {
	passed: boolean;
	passedCount: number;
	failedCount: number;
	totalCount: number;
	failures: NormalizedTestCase[];
	testCases: NormalizedTestCase[];
	exitCode: number | null;
	timedOut: boolean;
	runnerVersion: string;
	codeHash: string;
	durationMilliseconds: number;
}

export interface LocalTestRunner {
	run(request: LocalTestRunRequest): Promise<TestEvidence>;
}
