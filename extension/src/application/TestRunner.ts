export enum TestCategory {
	Current = 'current',
	Regression = 'regression',
}

export enum TestRunMode {
	Simulated = 'simulated',
	Executed = 'executed',
}

export enum TestCaseStatus {
	Queued = 'queued',
	Running = 'running',
	Passed = 'passed',
	Failed = 'failed',
}

export interface TestCaseResult {
	name: string;
	category: TestCategory;
	passed: boolean;
	durationMilliseconds: number;
	details?: string;
}

export interface TestRunResult {
	passed: boolean;
	mode: TestRunMode;
	attempt: number;
	durationMilliseconds: number;
	testCases: TestCaseResult[];
}

export interface TestCaseProgress {
	name: string;
	category: TestCategory;
	status: TestCaseStatus;
	durationMilliseconds?: number;
	details?: string;
}

export interface TestRunProgress {
	attempt: number;
	completedCount: number;
	totalCount: number;
	testCases: TestCaseProgress[];
}

export interface TestRunRequest {
	levelId: string;
	levelNumber: number;
}

export interface TestRunner {
	run(
		request: TestRunRequest,
		reportProgress?: (progress: TestRunProgress) => void,
	): Promise<TestRunResult>;
	reset(): void;
}
