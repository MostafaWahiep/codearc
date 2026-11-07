import type { AttemptSessionSnapshot } from '../application/AttemptSession';
import type {
	NormalizedTestCase,
	TestEvidence,
	TestRunError,
	TestRunOutcome,
} from '../application/LocalTestRunner';
import { ChallengeViewAction } from './ChallengeViewAction';
import { escapeHtml, formatDuration } from './viewFormatting';

export function renderBackendResults(snapshot: AttemptSessionSnapshot): string {
	if (snapshot.level.id !== snapshot.attempt.activeLevelId) {
		return `<section class="card">
			<p class="eyebrow">Test evidence</p>
			<h2>This is a completed stage</h2>
			<p class="small muted">New runs always check the active stage together with every completed-stage regression.</p>
		</section>
		<div class="sticky-actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.SelectAttemptLevel}" data-level-id="${escapeHtml(snapshot.attempt.activeLevelId)}">Return to current stage</button>
		</div>`;
	}

	if (snapshot.testStatus === 'running') {
		return `<section class="card" aria-live="polite" aria-busy="true">
			<p class="eyebrow">Local test evidence</p>
			<h2><span class="spinner" aria-hidden="true"></span>Running public tests…</h2>
			<p class="small muted">Checking the current requirement and replaying completed stages against your learner folder.</p>
		</section>`;
	}

	if (snapshot.submissionStatus === 'submitting') {
		return `<section class="card" aria-live="polite" aria-busy="true">
			<p class="eyebrow">Backend review</p>
			<h2><span class="spinner" aria-hidden="true"></span>Submitting to CodeArc…</h2>
			<p class="small muted">Your checks finished locally. CodeArc is now recording this attempt and deciding whether the next stage can be unlocked.</p>
		</section>`;
	}

	const evidence = snapshot.latestTestEvidence;
	if (!evidence) {
		return `<section class="card">
			<p class="eyebrow">Local test evidence</p>
			<h2>Not run yet</h2>
			<p class="muted">Run the current level's public tests and every completed level's regression tests against your saved learner code.</p>
			<h3>Evidence captured</h3>
			<ul>
				<li>Passed and failed checks</li>
				<li>Exit status and timeout</li>
				<li>pytest version and source-code hash</li>
			</ul>
		</section>
		<div class="sticky-actions">
			<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.RunChecks}">Run checks</button>
			<button class="action" type="button" data-action="${ChallengeViewAction.SubmitSolution}">Submit solution</button>
		</div>`;
	}

	const currentTests = evidence.testCases.filter((testCase) => testCase.category === 'current');
	const regressionTests = evidence.testCases.filter((testCase) => testCase.category === 'regression');
	const heading = runOutcomeHeading(evidence.outcome);
	const passed = evidence.outcome === 'passed';
	const statusClass = passed ? 'passed' : 'failed';

	return `<section class="card" aria-live="polite">
		${renderSubmissionNotice(snapshot)}
		<div class="check-summary">
			<span class="check-icon check-icon-${statusClass}" aria-hidden="true">${passed ? '✓' : '×'}</span>
			<div class="check-summary-content">
				<p class="eyebrow">Local test evidence</p>
				<h2>${heading}</h2>
				${renderRunMeta(evidence)}
			</div>
		</div>
		${evidence.runError ? renderRunError(evidence.outcome, evidence.runError) : ''}
		${renderCurrentTests(currentTests, snapshot.level.title)}
		${renderRegressionTests(regressionTests)}
		<details class="run-details">
			<summary>Run details</summary>
			<dl class="evidence-details">
				<div><dt>Runner</dt><dd>${escapeHtml(evidence.runnerVersion)}</dd></div>
				<div><dt>Exit status</dt><dd>${evidence.exitCode === null ? 'No exit status' : evidence.exitCode}</dd></div>
				<div><dt>Timed out</dt><dd>${evidence.timedOut ? 'Yes' : 'No'}</dd></div>
				<div><dt>Code hash</dt><dd><code title="${escapeHtml(evidence.codeHash)}">${escapeHtml(evidence.codeHash.slice(0, 12))}</code></dd></div>
			</dl>
		</details>
	</section>
	<div class="sticky-actions">
		<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.RunChecks}">Run checks again</button>
		<button class="action" type="button" data-action="${ChallengeViewAction.SubmitSolution}">Submit solution</button>
	</div>`;
}

function runOutcomeHeading(outcome: TestRunOutcome): string {
	switch (outcome) {
		case 'passed':
			return 'All public tests passed';
		case 'test_failures':
			return 'Some tests need attention';
		case 'code_error':
			return 'Your code could not be loaded';
		case 'runner_error':
			return 'Tests could not be run';
		case 'timed_out':
			return 'The test run timed out';
	}
}

function renderRunMeta(evidence: TestEvidence): string {
	const counts = evidence.totalCount === 0
		? '<span>0 tests run</span>'
		: `<span>${evidence.passedCount} passed</span>
			${evidence.failedCount > 0 ? `<span>${evidence.failedCount} failed</span>` : ''}`;
	return `<div class="run-meta">
		${counts}
		<span>${formatDuration(evidence.durationMilliseconds)}</span>
	</div>`;
}

function renderRunError(outcome: TestRunOutcome, error: TestRunError): string {
	const copy = runErrorCopy(outcome);
	return `<section class="run-error" role="alert">
		<p class="eyebrow">${copy.label}</p>
		<p>${copy.description}</p>
		<dl class="run-error-facts">
			<div><dt>Error</dt><dd><code>${escapeHtml(error.message)}</code></dd></div>
			${error.sourcePath && error.sourceLine
				? `<div><dt>Location</dt><dd><code>${escapeHtml(error.sourcePath)}:${error.sourceLine}</code></dd></div>`
				: ''}
		</dl>
		${error.sourcePath && error.sourceLine
			? renderOpenLearnerSourceAction(error.sourcePath, error.sourceLine)
			: ''}
		${renderTechnicalDetails(error.details)}
	</section>`;
}

function runErrorCopy(outcome: TestRunOutcome): { label: string; description: string } {
	switch (outcome) {
		case 'code_error':
			return {
				label: 'Learner code error',
				description: 'No tests ran. Pytest stopped while loading your code.',
			};
		case 'timed_out':
			return {
				label: 'Time limit exceeded',
				description: 'The test run did not finish within CodeArc’s time limit. Check for slow code or an infinite loop.',
			};
		case 'runner_error':
			return {
				label: 'Test runner error',
				description: 'CodeArc could not complete the test run. Your implementation may not be the cause.',
			};
		default:
			return {
				label: 'Test run error',
				description: 'CodeArc could not complete the test run.',
			};
	}
}

function renderSubmissionNotice(snapshot: AttemptSessionSnapshot): string {
	if (snapshot.submissionStatus === 'rejected') {
		return `<section class="submission-notice submission-notice-rejected" role="alert">
			<strong>CodeArc could not accept this submission.</strong>
			<p class="small">${escapeHtml(snapshot.submissionError ?? 'Try submitting again.')}</p>
		</section>`;
	}

	if (snapshot.submissionStatus === 'accepted') {
		return `<section class="submission-notice submission-notice-accepted">
			<strong>Submission recorded by CodeArc.</strong>
		</section>`;
	}

	return '';
}

function renderCurrentTests(tests: NormalizedTestCase[], levelTitle: string): string {
	if (tests.length === 0) {
		return '';
	}

	const failedTests = tests.filter((testCase) => testCase.status === 'failed');
	const passedTests = tests.filter((testCase) => testCase.status === 'passed');
	const status = failedTests.length === 0
		? `All ${tests.length} passed`
		: `${failedTests.length} of ${tests.length} failed`;

	return `<section class="test-group">
		<div class="test-group-heading">
			<div>
				<p class="eyebrow">Current requirement</p>
				<h3>${escapeHtml(levelTitle)}</h3>
			</div>
			<span>${status}</span>
		</div>
		${renderTestList(failedTests, false)}
		${renderPassedTests(passedTests, false, `${passedTests.length} current tests passed`)}
	</section>`;
}

function renderRegressionTests(tests: NormalizedTestCase[]): string {
	if (tests.length === 0) {
		return '';
	}

	const failedTests = tests.filter((testCase) => testCase.status === 'failed');
	const passedTests = tests.filter((testCase) => testCase.status === 'passed');
	const allPassed = failedTests.length === 0;
	return `<section class="test-group regression-group">
		<div class="test-group-heading">
			<div>
				<p class="eyebrow">Regression safety net</p>
				<h3>${allPassed
					? `All ${tests.length} previous-level tests passed`
					: `${failedTests.length} previous-level ${failedTests.length === 1 ? 'test failed' : 'tests failed'}`}</h3>
			</div>
			<span class="group-status group-status-${allPassed ? 'passed' : 'failed'}" aria-hidden="true">${allPassed ? '✓' : '×'}</span>
		</div>
		${renderRegressionLevelSummary(tests)}
		${renderTestList(failedTests, true)}
		${renderPassedTests(
			passedTests,
			true,
			allPassed ? 'Show regression tests' : `${passedTests.length} regression tests passed`,
		)}
	</section>`;
}

function renderRegressionLevelSummary(tests: NormalizedTestCase[]): string {
	const levels = new Map<string, NormalizedTestCase[]>();
	for (const testCase of tests) {
		const levelTests = levels.get(testCase.levelId) ?? [];
		levelTests.push(testCase);
		levels.set(testCase.levelId, levelTests);
	}

	return `<ul class="regression-levels">
		${[...levels].map(([levelId, levelTests]) => {
			const passedCount = levelTests.filter((testCase) => testCase.status === 'passed').length;
			return `<li><span>${escapeHtml(formatLevelName(levelId))}</span><strong>${passedCount}/${levelTests.length}</strong></li>`;
		}).join('')}
	</ul>`;
}

function renderPassedTests(
	tests: NormalizedTestCase[],
	showLevel: boolean,
	label: string,
): string {
	if (tests.length === 0) {
		return '';
	}

	return `<details class="passed-tests">
		<summary><span aria-hidden="true">✓</span> ${escapeHtml(label)}</summary>
		${renderTestList(tests, showLevel)}
	</details>`;
}

function renderTestList(tests: NormalizedTestCase[], showLevel: boolean): string {
	if (tests.length === 0) {
		return '';
	}

	return `<ul class="test-list">
		${tests.map((testCase) => renderTestCase(testCase, showLevel)).join('')}
	</ul>`;
}

function renderTestCase(testCase: NormalizedTestCase, showLevel: boolean): string {
	const passed = testCase.status === 'passed';
	return `<li class="test-case test-case-${passed ? 'passed' : 'failed'}">
		<div class="test-case-heading">
			<span class="test-mark" aria-hidden="true">${passed ? '✓' : '×'}</span>
			<div class="test-case-copy">
				<strong class="test-name" title="${escapeHtml(testCase.name)}">${escapeHtml(formatTestName(testCase.name))}</strong>
				${showLevel ? `<span class="test-level">${escapeHtml(formatLevelName(testCase.levelId))}</span>` : ''}
			</div>
		</div>
		${passed ? '' : renderFailureDetails(testCase)}
	</li>`;
}

function renderFailureDetails(testCase: NormalizedTestCase): string {
	const message = testCase.message ?? 'Test did not pass.';
	const traceback = testCase.traceback?.trim();
	const actions = [
		testCase.sourcePath && testCase.sourceLine
			? renderOpenLearnerSourceAction(testCase.sourcePath, testCase.sourceLine)
			: '',
		testCase.testPath
			? renderOpenTestCaseAction(
				testCase.testPath,
				testCase.testFunctionName ?? testCase.name,
			) : '',
	].filter(Boolean).join('');
	return `<div class="test-failure">
		${renderFailureKind(testCase.failureKind)}
		${testCase.comparison ? `<div class="failure-comparison">
			<div><span>Expected</span><code>${escapeHtml(testCase.comparison.expected)}</code></div>
			<div><span>Received</span><code>${escapeHtml(testCase.comparison.received)}</code></div>
		</div>` : `<p class="failure-message">${escapeHtml(message)}</p>`}
		${testCase.stdout ? `<div class="test-output"><span>Output</span><code>${escapeHtml(testCase.stdout)}</code></div>` : ''}
		${actions ? `<div class="failure-actions">${actions}</div>` : ''}
		${traceback ? renderTechnicalDetails(traceback) : ''}
	</div>`;
}

function renderFailureKind(
	failureKind: NormalizedTestCase['failureKind'],
): string {
	switch (failureKind) {
		case 'learner_error':
			return '<p class="failure-kind">Your code raised an unexpected error while this test ran.</p>';
		case 'test_error':
			return '<p class="failure-kind">This test could not complete normally.</p>';
		case 'timed_out':
			return '<p class="failure-kind">This test was still running when CodeArc’s time limit expired.</p>';
		default:
			return '';
	}
}

function renderOpenLearnerSourceAction(sourcePath: string, sourceLine: number): string {
	return `<button
		class="test-source-link"
		type="button"
		data-action="${ChallengeViewAction.OpenLearnerSource}"
		data-source-path="${escapeHtml(sourcePath)}"
		data-source-line="${sourceLine}"
	>Open your code ↗</button>`;
}

function renderOpenTestCaseAction(testPath: string, testFunctionName: string): string {
	return `<button
		class="test-source-link"
		type="button"
		data-action="${ChallengeViewAction.OpenTestCase}"
		data-test-path="${escapeHtml(testPath)}"
		data-test-name="${escapeHtml(testFunctionName)}"
	>Open test case ↗</button>`;
}

function renderTechnicalDetails(details: string): string {
	return `<details class="technical-details">
		<summary>Details</summary>
		<pre><code>${escapeHtml(details)}</code></pre>
	</details>`;
}

function formatTestName(name: string): string {
	const readableName = name.replace(/^test_/, '').replaceAll('_', ' ');
	return readableName.length === 0
		? name
		: `${readableName[0].toUpperCase()}${readableName.slice(1)}`;
}

function formatLevelName(levelId: string): string {
	return levelId
		.split('-')
		.map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
		.join(' ');
}
