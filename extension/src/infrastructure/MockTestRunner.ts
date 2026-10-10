import {
	TestCaseStatus,
	TestCategory,
	TestRunMode,
	type TestCaseProgress,
	type TestCaseResult,
	type TestRunProgress,
	type TestRunRequest,
	type TestRunResult,
	type TestRunner,
} from '../application/TestRunner';

interface PlannedTest {
	name: string;
	category: TestCategory;
	failsOnFirstAttempt?: boolean;
	failureDetails?: string;
}

const currentTestsByLevel: Record<string, PlannedTest[]> = {
	'single-term-search': [
		currentTest('finds exact terms case-insensitively'),
		currentTest('excludes partial-term matches'),
		currentTest('keeps results in first-indexed order'),
		currentTest(
			'replaces an existing document',
			'Expected old terms to disappear after re-indexing the same document ID.',
		),
	],
	'prefix-search': [
		currentTest('matches terms using a trailing-wildcard prefix'),
		currentTest('returns each matching document only once'),
		currentTest('handles an empty prefix safely'),
		currentTest(
			'keeps exact-term behavior unchanged',
			'Expected an unquoted query without * to remain an exact-term search.',
		),
	],
	'phrase-search': [
		currentTest('matches consecutive terms in the requested order'),
		currentTest('rejects reordered and non-consecutive terms'),
		currentTest('treats wildcards literally inside quotes'),
		currentTest(
			'supports repeated terms in a phrase',
			'Expected a phrase containing the same term twice to match consecutive occurrences.',
		),
	],
};

export class MockTestRunner implements TestRunner {
	private readonly attemptsByLevel = new Map<string, number>();
	private generation = 0;

	public constructor(private readonly delayMilliseconds = 140) {}

	public async run(
		request: TestRunRequest,
		reportProgress?: (progress: TestRunProgress) => void,
	): Promise<TestRunResult> {
		const generation = this.generation;
		const attempt = (this.attemptsByLevel.get(request.levelId) ?? 0) + 1;
		this.attemptsByLevel.set(request.levelId, attempt);

		const plan = createTestPlan(request);
		const progressCases: TestCaseProgress[] = plan.map((testCase) => ({
			name: testCase.name,
			category: testCase.category,
			status: TestCaseStatus.Queued,
		}));
		const results: TestCaseResult[] = [];
		const startedAt = Date.now();

		emitProgress(reportProgress, attempt, progressCases);

		for (const [index, plannedTest] of plan.entries()) {
			if (generation !== this.generation) {
				return cancelledResult(attempt, startedAt);
			}

			progressCases[index] = {
				...progressCases[index],
				status: TestCaseStatus.Running,
			};
			emitProgress(reportProgress, attempt, progressCases);

			const caseStartedAt = Date.now();
			await delay(this.delayMilliseconds);
			if (generation !== this.generation) {
				return cancelledResult(attempt, startedAt);
			}

			const passed = !(attempt === 1 && plannedTest.failsOnFirstAttempt);
			const durationMilliseconds = Date.now() - caseStartedAt;
			const details = passed ? undefined : plannedTest.failureDetails;

			results.push({
				name: plannedTest.name,
				category: plannedTest.category,
				passed,
				durationMilliseconds,
				details,
			});
			progressCases[index] = {
				...progressCases[index],
				status: passed ? TestCaseStatus.Passed : TestCaseStatus.Failed,
				durationMilliseconds,
				details,
			};
			emitProgress(reportProgress, attempt, progressCases);
		}

		return {
			passed: results.every((testCase) => testCase.passed),
			mode: TestRunMode.Simulated,
			attempt,
			durationMilliseconds: Date.now() - startedAt,
			testCases: results,
		};
	}

	public reset(): void {
		this.generation += 1;
		this.attemptsByLevel.clear();
	}
}

function createTestPlan(request: TestRunRequest): PlannedTest[] {
	const currentTests = currentTestsByLevel[request.levelId] ?? [
		currentTest(
			'meets the current-stage requirement',
			'Expected the new behavior while preserving the existing contract.',
		),
	];
	const regressionTests: PlannedTest[] = [];

	if (request.levelNumber > 1) {
		regressionTests.push(regressionTest('Level 1 exact-search regression suite'));
	}
	if (request.levelNumber > 2) {
		regressionTests.push(regressionTest('Level 2 prefix-search regression suite'));
	}

	return [...currentTests, ...regressionTests];
}

function currentTest(name: string, failureDetails?: string): PlannedTest {
	return {
		name,
		category: TestCategory.Current,
		failsOnFirstAttempt: Boolean(failureDetails),
		failureDetails,
	};
}

function regressionTest(name: string): PlannedTest {
	return { name, category: TestCategory.Regression };
}

function emitProgress(
	reportProgress: ((progress: TestRunProgress) => void) | undefined,
	attempt: number,
	testCases: TestCaseProgress[],
): void {
	reportProgress?.({
		attempt,
		completedCount: testCases.filter(
			(testCase) => testCase.status === TestCaseStatus.Passed
				|| testCase.status === TestCaseStatus.Failed,
		).length,
		totalCount: testCases.length,
		testCases: testCases.map((testCase) => ({ ...testCase })),
	});
}

function cancelledResult(attempt: number, startedAt: number): TestRunResult {
	return {
		passed: false,
		mode: TestRunMode.Simulated,
		attempt,
		durationMilliseconds: Date.now() - startedAt,
		testCases: [],
	};
}

async function delay(milliseconds: number): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}
