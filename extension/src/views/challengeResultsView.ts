import type { AttemptSessionSnapshot } from '../application/AttemptSession';
import type { NormalizedTestCase } from '../application/LocalTestRunner';
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
			<button class="action" type="button" data-action="${ChallengeViewAction.RunChecks}">Run public tests</button>
		</div>`;
	}

	const currentTests = evidence.testCases.filter((testCase) => testCase.category === 'current');
	const regressionTests = evidence.testCases.filter((testCase) => testCase.category === 'regression');
	const heading = evidence.passed ? 'All public tests passed' : 'Some tests need attention';
	const statusClass = evidence.passed ? 'passed' : 'failed';

	return `<section class="card" aria-live="polite">
		<div class="check-summary">
			<span class="check-icon check-icon-${statusClass}" aria-hidden="true">${evidence.passed ? '✓' : '×'}</span>
			<div class="check-summary-content">
				<p class="eyebrow">Local test evidence</p>
				<h2>${heading}</h2>
				<div class="run-meta">
					<span>${evidence.passedCount} passed</span>
					${evidence.failedCount > 0 ? `<span>${evidence.failedCount} failed</span>` : ''}
					<span>${formatDuration(evidence.durationMilliseconds)}</span>
				</div>
			</div>
		</div>
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
		<button class="action" type="button" data-action="${ChallengeViewAction.RunChecks}">Run tests again</button>
	</div>`;
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
		${testCase.details ? renderFailureDetails(testCase.details, testCase.name) : ''}
	</li>`;
}

function renderFailureDetails(details: string, testName: string): string {
	const { location, message } = splitFailureDetails(details);
	const comparison = parseEqualityAssertion(message);
	return `<div class="test-failure">
		${comparison ? `<div class="failure-comparison">
			<div><span>Expected</span><code>${escapeHtml(comparison.expected)}</code></div>
			<div><span>Received</span><code>${escapeHtml(comparison.received)}</code></div>
		</div>` : `<p class="failure-message">${escapeHtml(message)}</p>`}
		${location ? renderOpenTestCaseAction(location, testName) : ''}
	</div>`;
}

function renderOpenTestCaseAction(location: string, testName: string): string {
	const testPath = location.split('::', 1)[0];
	const functionName = testName.split('[', 1)[0];
	return `<button
		class="test-source-link"
		type="button"
		data-action="${ChallengeViewAction.OpenTestCase}"
		data-test-path="${escapeHtml(testPath)}"
		data-test-name="${escapeHtml(functionName)}"
	>Open test case ↗</button>`;
}

function splitFailureDetails(details: string): {
	location?: string;
	message: string;
} {
	const separatorIndex = details.indexOf(' - ');
	if (separatorIndex < 0) {
		return { message: details };
	}

	return {
		location: details.slice(0, separatorIndex).trim(),
		message: details.slice(separatorIndex + 3).trim(),
	};
}

function parseEqualityAssertion(message: string): {
	expected: string;
	received: string;
} | undefined {
	const match = /^AssertionError:\s*assert\s+(.+?)\s*==\s*(.+)$/s.exec(message);
	if (!match) {
		return undefined;
	}

	return {
		received: match[1].trim(),
		expected: match[2].trim(),
	};
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
