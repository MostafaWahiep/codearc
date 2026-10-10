import {
	ChallengeSection,
	SessionStatus,
	type PrototypeSessionSnapshot,
} from '../application/PrototypeSession';
import {
	TestCaseStatus,
	TestCategory,
	type TestCaseProgress,
	type TestCaseResult,
} from '../application/TestRunner';
import { ChallengeViewAction } from './ChallengeViewAction';
import {
	escapeHtml,
	formatDuration,
	formatEnumLabel,
	testStatusSymbol,
} from './viewFormatting';

export function renderResults(snapshot: PrototypeSessionSnapshot): string {
	if (snapshot.status === SessionStatus.Running) {
		return renderRunningEvidence(snapshot);
	}

	if (!snapshot.latestTestResult) {
		return `<section class="card">
			<p class="eyebrow">Latest check</p>
			<h2>Not run yet</h2>
			<p class="muted">The run will check the current requirement and replay every earlier stage as a regression safety net.</p>
			<h3>Run includes</h3>
			<ul>
				<li>Current-stage public behavior</li>
				<li>Previous-stage regression coverage</li>
				<li>Detailed failures and per-check timing</li>
			</ul>
		</section>
		<div class="sticky-actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.RunChecks}">Run checks</button>
		</div>`;
	}

	const result = snapshot.latestTestResult;
	const passed = result.passed;
	const staleAfterRefactor = snapshot.status === SessionStatus.Refactoring;
	const heading = staleAfterRefactor
		? 'Previous check passed'
		: passed ? 'All checks passed' : 'Some checks need attention';
	const summaryClass = passed ? SessionStatus.Passed : SessionStatus.Failed;
	const summarySymbol = passed ? '✓' : '×';
	const passedCount = result.testCases.filter((testCase) => testCase.passed).length;
	const failedCount = result.testCases.length - passedCount;
	const currentTests = result.testCases.filter(
		(testCase) => testCase.category === TestCategory.Current,
	);
	const regressionTests = result.testCases.filter(
		(testCase) => testCase.category === TestCategory.Regression,
	);

	return `${staleAfterRefactor ? `<div class="callout callout-refactor">
		<strong>Rerun required</strong>
		<p class="small">This result predates your refactor. Continuing stays locked until the checks pass again.</p>
	</div>` : ''}
		<section class="card" aria-live="polite">
			<div class="check-summary">
				<span class="check-icon check-icon-${summaryClass}" aria-hidden="true">${summarySymbol}</span>
				<div>
					<p class="eyebrow">Prototype check · ${escapeHtml(formatEnumLabel(result.mode))}</p>
					<h2>${escapeHtml(heading)}</h2>
					<div class="run-meta">
						<span>Attempt ${result.attempt}</span>
						<span>${passedCount} passed</span>
						${failedCount > 0 ? `<span>${failedCount} failed</span>` : ''}
						<span>${formatDuration(result.durationMilliseconds)}</span>
					</div>
				</div>
			</div>
			${renderTestGroup('Current-stage checks', currentTests)}
			${renderTestGroup('Regression checks', regressionTests)}
		</section>
		${passed && !staleAfterRefactor ? renderImpactPreview(snapshot) : ''}
		${renderEvidenceAction(snapshot)}`;
}

function renderTestGroup(title: string, tests: TestCaseResult[]): string {
	if (tests.length === 0) {
		return '';
	}

	return `<h3>${escapeHtml(title)}</h3>
		<ul class="test-list">
			${tests.map((testCase) => `<li class="test-case test-case-${testCase.passed ? SessionStatus.Passed : SessionStatus.Failed}">
				<span class="test-mark" aria-hidden="true">${testCase.passed ? '✓' : '×'}</span>
				<span>${escapeHtml(testCase.name)}</span>
				<span class="test-duration">${formatDuration(testCase.durationMilliseconds)}</span>
				${testCase.details ? `<span class="test-details">${escapeHtml(testCase.details)}</span>` : ''}
			</li>`).join('')}
		</ul>`;
}

function renderRunningEvidence(snapshot: PrototypeSessionSnapshot): string {
	const progress = snapshot.testProgress;
	if (!progress) {
		return `<section class="card" aria-live="polite" aria-busy="true">
			<p><span class="spinner" aria-hidden="true"></span><strong>Discovering checks…</strong></p>
			<p class="small muted">Preparing current-stage and regression coverage.</p>
		</section>`;
	}

	const activeTest = progress.testCases.find(
		(testCase) => testCase.status === TestCaseStatus.Running,
	);
	const percentComplete = progress.totalCount === 0
		? 0
		: Math.round((progress.completedCount / progress.totalCount) * 100);
	const currentTests = progress.testCases.filter(
		(testCase) => testCase.category === TestCategory.Current,
	);
	const regressionTests = progress.testCases.filter(
		(testCase) => testCase.category === TestCategory.Regression,
	);
	const heading = progress.completedCount === progress.totalCount
		? 'Finalizing results…'
		: `Running check ${progress.completedCount + 1} of ${progress.totalCount}`;

	return `<section class="card" aria-live="polite" aria-busy="true">
		<p class="eyebrow">Prototype check · Simulated</p>
		<h2><span class="spinner" aria-hidden="true"></span>${escapeHtml(heading)}</h2>
		<p class="small muted">${activeTest ? escapeHtml(activeTest.name) : 'Preparing the next check…'}</p>
		<div
			class="run-progress"
			role="progressbar"
			aria-label="Test run progress"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow="${percentComplete}"
		>
			<div class="run-progress-bar" style="width: ${percentComplete}%"></div>
		</div>
		<div class="run-meta">
			<span>Attempt ${progress.attempt}</span>
			<span>${progress.completedCount} of ${progress.totalCount} complete</span>
		</div>
		${renderProgressGroup('Current-stage checks', currentTests)}
		${renderProgressGroup('Regression checks', regressionTests)}
	</section>`;
}

function renderProgressGroup(title: string, tests: TestCaseProgress[]): string {
	if (tests.length === 0) {
		return '';
	}

	return `<h3>${escapeHtml(title)}</h3>
		<ul class="test-list">
			${tests.map((testCase) => `<li class="test-case test-case-${testCase.status}">
				<span class="test-mark" aria-hidden="true">${testStatusSymbol(testCase.status)}</span>
				<span>${escapeHtml(testCase.name)}</span>
				${testCase.durationMilliseconds === undefined ? '' : `<span class="test-duration">${formatDuration(testCase.durationMilliseconds)}</span>`}
				${testCase.details ? `<span class="test-details">${escapeHtml(testCase.details)}</span>` : ''}
			</li>`).join('')}
		</ul>`;
}

function renderImpactPreview(snapshot: PrototypeSessionSnapshot): string {
	const level = snapshot.challenge?.currentLevelNumber ?? 1;
	const metrics = [
		['Files changed', String(level === 3 ? 2 : 1)],
		['Methods affected', String(level + 1)],
		['Public API changes', '0'],
		['Regression failures', '0'],
	];

	return `<section class="card">
		<p class="eyebrow">Prototype preview · Simulated</p>
		<h2>Change impact</h2>
		<div class="metric-list">
			${metrics.map(([label, value]) => `<div class="metric">
				<span>${escapeHtml(label)}</span>
				<span class="metric-value">${escapeHtml(value)}</span>
			</div>`).join('')}
		</div>
		<p class="small muted">Change impact is evidence, not a design score. More change can be the right engineering decision.</p>
	</section>`;
}

function renderEvidenceAction(snapshot: PrototypeSessionSnapshot): string {
	if (snapshot.status === SessionStatus.Failed) {
		return `<div class="sticky-actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.RunChecks}">Simulate fix and rerun</button>
		</div>`;
	}

	if (snapshot.status === SessionStatus.Refactoring) {
		return `<div class="sticky-actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.SelectSection}" data-section="${ChallengeSection.Build}">Return to refactor</button>
		</div>`;
	}

	return `<div class="sticky-actions">
		<button class="action" type="button" data-action="${ChallengeViewAction.SelectSection}" data-section="${ChallengeSection.Design}">Review ${escapeHtml(ChallengeSection.Design.toLowerCase())}</button>
	</div>`;
}
