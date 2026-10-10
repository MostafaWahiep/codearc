import { randomBytes } from 'node:crypto';
import {
	ChallengeSection,
	SessionStatus,
	type PrototypeSessionSnapshot,
} from '../application/PrototypeSession';
import {
	TestCaseStatus,
	TestCategory,
	TestRunMode,
	type TestCaseProgress,
	type TestCaseResult,
} from '../application/TestRunner';
import { ChallengeViewAction } from './ChallengeViewAction';

export function createChallengeViewHtml(
	snapshot: PrototypeSessionSnapshot,
): string {
	const nonce = randomBytes(16).toString('base64');
	const body = snapshot.challenge
		? renderChallenge(snapshot)
		: renderWelcome();

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta
		http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
	>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CodeArc</title>
	<style>
		* { box-sizing: border-box; }

		:root { color-scheme: light dark; }

		body {
			margin: 0;
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			line-height: 1.5;
		}

		button { font: inherit; }
		h1, h2, h3 { line-height: 1.3; }
		h1 { margin: 3px 0 7px; font-size: 19px; }
		h2 { margin: 0 0 10px; font-size: 15px; }
		h3 { margin: 17px 0 7px; font-size: 13px; }
		p { margin: 8px 0; }
		ul { margin: 8px 0; padding-left: 20px; }

		.shell { min-height: 100vh; padding: 14px 14px 90px; }

		.brand {
			display: flex;
			align-items: center;
			gap: 7px;
			margin-bottom: 14px;
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		.brand-mark {
			display: inline-grid;
			width: 18px;
			height: 18px;
			place-items: center;
			border-radius: 4px;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			font-size: 10px;
		}

		.eyebrow {
			margin: 0;
			color: var(--vscode-descriptionForeground);
			font-size: 10px;
			font-weight: 700;
			letter-spacing: 0.07em;
			text-transform: uppercase;
		}

		.stage-meta {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}

		.status {
			display: inline-flex;
			align-items: center;
			gap: 5px;
			padding: 2px 7px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 999px;
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
		}

		.status::before {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: currentColor;
			content: '';
		}

		.status-running { color: var(--vscode-progressBar-background); }
		.status-failed { color: var(--vscode-testing-iconFailed); }
		.status-passed { color: var(--vscode-testing-iconPassed); }
		.status-refactoring { color: var(--vscode-charts-purple); }

		.progress-track { display: flex; gap: 5px; margin: 13px 0 16px; }

		.progress-step {
			flex: 1;
			height: 4px;
			border-radius: 999px;
			background: var(--vscode-panel-border);
		}

		.progress-step-complete { background: var(--vscode-testing-iconPassed); }
		.progress-step-current { background: var(--vscode-progressBar-background); }

		.tabs {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			margin: 0 -4px 14px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.tab {
			position: relative;
			padding: 8px 3px;
			border: 0;
			color: var(--vscode-descriptionForeground);
			background: transparent;
			cursor: pointer;
			font-size: 11px;
		}

		.tab:hover:not(:disabled) { color: var(--vscode-foreground); }
		.tab[aria-selected='true'] { color: var(--vscode-foreground); }

		.tab[aria-selected='true']::after {
			position: absolute;
			right: 5px;
			bottom: -1px;
			left: 5px;
			height: 2px;
			background: var(--vscode-focusBorder);
			content: '';
		}

		.tab:disabled { opacity: 0.45; cursor: not-allowed; }

		.card {
			margin-top: 11px;
			padding: 12px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			background: var(--vscode-editor-background);
		}

		.card-flat { background: transparent; }

		.callout {
			padding: 10px 11px;
			border-left: 3px solid var(--vscode-focusBorder);
			background: var(--vscode-textBlockQuote-background);
		}

		.callout-failed { border-left-color: var(--vscode-testing-iconFailed); }
		.callout-passed { border-left-color: var(--vscode-testing-iconPassed); }
		.callout-refactor { border-left-color: var(--vscode-charts-purple); }

		.muted { color: var(--vscode-descriptionForeground); }
		.small { font-size: 11px; }
		.locked { display: flex; gap: 8px; align-items: flex-start; }
		.lock { color: var(--vscode-descriptionForeground); }

		.code-block {
			overflow-x: auto;
			padding: 9px;
			border-radius: 4px;
			background: var(--vscode-textCodeBlock-background);
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			white-space: pre;
		}

		code {
			padding: 1px 3px;
			font-family: var(--vscode-editor-font-family);
			background: var(--vscode-textCodeBlock-background);
		}

		.actions { display: grid; gap: 8px; margin-top: 12px; }

		.action {
			width: 100%;
			padding: 8px 10px;
			border: 1px solid transparent;
			border-radius: 3px;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			cursor: pointer;
		}

		.action:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }

		.action-secondary {
			border-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
		}

		.action-secondary:hover:not(:disabled) {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.action-quiet {
			border-color: var(--vscode-panel-border);
			color: var(--vscode-foreground);
			background: transparent;
		}

		.action-quiet:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
		.action:disabled { opacity: 0.65; cursor: wait; }

		.sticky-actions {
			position: fixed;
			right: 0;
			bottom: 0;
			left: 0;
			z-index: 2;
			padding: 10px 14px 13px;
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
		}

		.sticky-actions .action { margin: 0; }

		.check-summary {
			display: flex;
			align-items: flex-start;
			gap: 9px;
		}

		.check-icon {
			display: inline-grid;
			flex: 0 0 auto;
			width: 21px;
			height: 21px;
			place-items: center;
			border-radius: 50%;
			font-weight: 700;
		}

		.check-icon-passed {
			color: var(--vscode-testing-iconPassed);
			background: color-mix(in srgb, var(--vscode-testing-iconPassed) 15%, transparent);
		}

		.check-icon-failed {
			color: var(--vscode-testing-iconFailed);
			background: color-mix(in srgb, var(--vscode-testing-iconFailed) 15%, transparent);
		}

		.run-progress {
			overflow: hidden;
			height: 4px;
			margin: 12px 0 7px;
			border-radius: 999px;
			background: var(--vscode-panel-border);
		}

		.run-progress-bar {
			height: 100%;
			background: var(--vscode-progressBar-background);
			transition: width 120ms ease-out;
		}

		.run-meta {
			display: flex;
			flex-wrap: wrap;
			gap: 4px 10px;
			margin-top: 5px;
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
		}

		.run-meta span + span::before {
			margin-right: 10px;
			color: var(--vscode-panel-border);
			content: '•';
		}

		.test-list { margin: 10px 0 0; padding: 0; list-style: none; }
		.test-case {
			display: grid;
			grid-template-columns: 18px minmax(0, 1fr) auto;
			margin: 8px 0;
		}
		.test-case-queued { color: var(--vscode-descriptionForeground); }
		.test-case-running .test-mark {
			color: var(--vscode-progressBar-background);
			animation: spin 0.8s linear infinite;
		}
		.test-case-passed .test-mark { color: var(--vscode-testing-iconPassed); }
		.test-case-failed .test-mark { color: var(--vscode-testing-iconFailed); }
		.test-duration { color: var(--vscode-descriptionForeground); font-size: 11px; }
		.test-details { grid-column: 2 / 4; margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 11px; }

		.metric-list { margin: 10px 0 0; }
		.metric {
			display: flex;
			justify-content: space-between;
			gap: 12px;
			padding: 6px 0;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.metric:last-child { border-bottom: 0; }
		.metric-value { font-weight: 700; }

		.spinner {
			display: inline-block;
			width: 13px;
			height: 13px;
			margin-right: 7px;
			border: 2px solid var(--vscode-panel-border);
			border-top-color: var(--vscode-progressBar-background);
			border-radius: 50%;
			vertical-align: -2px;
			animation: spin 0.8s linear infinite;
		}

		@keyframes spin { to { transform: rotate(360deg); } }

		.welcome {
			display: grid;
			min-height: 75vh;
			padding: 20px;
			place-content: center;
			text-align: center;
		}

		.welcome-mark {
			display: inline-grid;
			width: 44px;
			height: 44px;
			margin: 0 auto 12px;
			place-items: center;
			border-radius: 11px;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			font-size: 20px;
			font-weight: 700;
		}

		.sr-only {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}
	</style>
</head>
<body>
	${body}
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		document.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}

			const button = target.closest('button[data-action]');
			if (!button || button.disabled) {
				return;
			}

			const type = button.dataset.action;
			if (!type) {
				return;
			}

			if (type !== '${ChallengeViewAction.SelectSection}') {
				button.disabled = true;
			}

			vscode.postMessage({ type, section: button.dataset.section });
		});

		document.addEventListener('keydown', (event) => {
			if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
				return;
			}

			const target = event.target;
			if (!(target instanceof Element) || !target.matches('[role="tab"]')) {
				return;
			}

			const tabs = Array.from(document.querySelectorAll('[role="tab"]'))
				.filter((tab) => !tab.disabled);
			const currentIndex = tabs.indexOf(target);
			if (currentIndex < 0 || tabs.length === 0) {
				return;
			}

			event.preventDefault();
			let nextIndex;
			if (event.key === 'Home') {
				nextIndex = 0;
			} else if (event.key === 'End') {
				nextIndex = tabs.length - 1;
			} else if (event.key === 'ArrowRight') {
				nextIndex = (currentIndex + 1) % tabs.length;
			} else {
				nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
			}

			tabs[nextIndex].focus();
			tabs[nextIndex].click();
		});
	</script>
</body>
</html>`;
}

function renderWelcome(): string {
	return `<main class="welcome">
		<div class="welcome-mark" aria-hidden="true">C</div>
		<p class="eyebrow">Learn through change</p>
		<h1>CodeArc</h1>
		<p class="muted">Evolve one codebase as new requirements appear.</p>
		<div class="actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.Start}">Start search challenge</button>
		</div>
		<p class="small muted">Week 1 interactive prototype</p>
	</main>`;
}

function renderChallenge(snapshot: PrototypeSessionSnapshot): string {
	const challenge = snapshot.challenge;
	if (!challenge) {
		return renderWelcome();
	}

	const stageLabel = `Stage ${challenge.currentLevelNumber} of ${challenge.totalLevels}`;
	const activeSectionId = sectionDomId(snapshot.activeSection);

	return `<main class="shell">
		<div class="brand"><span class="brand-mark" aria-hidden="true">C</span> CodeArc</div>
		<header>
			<div class="stage-meta">
				<p class="eyebrow">${escapeHtml(stageLabel)}</p>
				<span class="status status-${snapshot.status}">${escapeHtml(statusLabel(snapshot.status))}</span>
			</div>
			<h1>${escapeHtml(challenge.title)}</h1>
			${renderProgress(snapshot)}
		</header>
		${renderTabs(snapshot)}
		<section
			id="panel-${activeSectionId}"
			role="tabpanel"
			aria-labelledby="tab-${activeSectionId}"
		>
			${renderActiveSection(snapshot)}
		</section>
	</main>`;
}

function renderProgress(snapshot: PrototypeSessionSnapshot): string {
	const challenge = snapshot.challenge;
	if (!challenge) {
		return '';
	}

	const steps = Array.from({ length: challenge.totalLevels }, (_, index) => {
		const stage = index + 1;
		const state = stage < challenge.currentLevelNumber
			? 'complete'
			: stage === challenge.currentLevelNumber
				? snapshot.status === SessionStatus.Passed ? 'complete' : 'current'
				: 'locked';

		return `<span
			class="progress-step progress-step-${state}"
			aria-label="Stage ${stage}: ${state}"
		></span>`;
	}).join('');

	return `<div
		class="progress-track"
		role="img"
		aria-label="Stage ${challenge.currentLevelNumber} of ${challenge.totalLevels}"
	>${steps}</div>`;
}

function renderTabs(snapshot: PrototypeSessionSnapshot): string {
	const tabs = Object.values(ChallengeSection);

	return `<nav class="tabs" role="tablist" aria-label="Challenge sections">
		${tabs.map((section) => {
			const selected = snapshot.activeSection === section;
			const disabled = section === ChallengeSection.Design
				&& !snapshot.isEvolutionUnlocked;
			const id = sectionDomId(section);

			return `<button
				id="tab-${id}"
				class="tab"
				type="button"
				role="tab"
				aria-selected="${String(selected)}"
				aria-controls="panel-${id}"
				tabindex="${selected ? '0' : '-1'}"
				data-action="${ChallengeViewAction.SelectSection}"
				data-section="${escapeHtml(section)}"
				${disabled ? 'disabled title="Unlocks after checks pass"' : ''}
			>${escapeHtml(section)}${disabled ? ' · Locked' : ''}</button>`;
		}).join('')}
	</nav>`;
}

function renderActiveSection(snapshot: PrototypeSessionSnapshot): string {
	switch (snapshot.activeSection) {
		case ChallengeSection.Build:
			return renderTask(snapshot);
		case ChallengeSection.Results:
			return renderEvidence(snapshot);
		case ChallengeSection.Design:
			return renderEvolution(snapshot);
	}
}

function renderTask(snapshot: PrototypeSessionSnapshot): string {
	const challenge = snapshot.challenge;
	if (!challenge) {
		return '';
	}

	const refactorNotice = snapshot.status === SessionStatus.Refactoring
		? `<div class="callout callout-refactor" role="status">
			<strong>Refactoring checkpoint</strong>
			<p class="small">Improve the design without changing behavior, then rerun every check before continuing.</p>
		</div>`
		: '';

	return `${refactorNotice}
		<section class="card" aria-labelledby="stage-title">
			<p class="eyebrow">Current requirement</p>
			<h2 id="stage-title">${escapeHtml(challenge.currentLevel.title)}</h2>
			${renderMarkdown(removeLeadingHeading(challenge.currentLevel.requirement))}
		</section>
		<div class="actions">
			<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.OpenStarter}">Open starter code</button>
		</div>
		<section class="card card-flat locked">
			<span class="lock" aria-hidden="true">◇</span>
			<div>
				<strong>Next requirement is hidden</strong>
				<p class="small muted">It appears only after this stage passes and you review the design tradeoffs.</p>
			</div>
		</section>
		${renderTaskAction(snapshot)}`;
}

function renderTaskAction(snapshot: PrototypeSessionSnapshot): string {
	if (snapshot.status === SessionStatus.Running) {
		return `<div class="sticky-actions">
			<button class="action" type="button" disabled>
				<span class="spinner" aria-hidden="true"></span>Running current and regression checks…
			</button>
		</div>`;
	}

	if (snapshot.status === SessionStatus.Passed) {
		return `<div class="sticky-actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.SelectSection}" data-section="${ChallengeSection.Results}">Review ${escapeHtml(ChallengeSection.Results.toLowerCase())}</button>
		</div>`;
	}

	const label = snapshot.status === SessionStatus.Failed
		? 'Run checks again'
		: snapshot.status === SessionStatus.Refactoring
			? 'Run checks after refactor'
			: 'Run checks';

	return `<div class="sticky-actions">
		<button class="action" type="button" data-action="${ChallengeViewAction.RunChecks}">${escapeHtml(label)}</button>
	</div>`;
}

function renderEvidence(snapshot: PrototypeSessionSnapshot): string {
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

function renderEvolution(snapshot: PrototypeSessionSnapshot): string {
	const challenge = snapshot.challenge;
	if (!challenge || !snapshot.isEvolutionUnlocked) {
		return `<section class="card locked">
			<span class="lock" aria-hidden="true">◇</span>
			<div><strong>${escapeHtml(ChallengeSection.Design)} is locked</strong><p class="small muted">Pass this stage to reveal its design tradeoffs.</p></div>
		</section>`;
	}

	const feedback = challenge.currentLevel.designFeedback ?? '';
	const waitingForChecks = snapshot.status !== SessionStatus.Passed;

	return `${waitingForChecks ? `<div class="callout callout-refactor">
		<strong>Checkpoint still open</strong>
		<p class="small">The design reflection stays available, but the next requirement remains locked until your latest code passes.</p>
	</div>` : ''}
		<section class="card">
			<p class="eyebrow">Design reflection</p>
			${renderMarkdown(removeLeadingHeading(feedback))}
		</section>
		<section class="card card-flat">
			<strong>There is no automatic “best design” here.</strong>
			<p class="small muted">Compare the tradeoffs with what your implementation actually made easy or difficult.</p>
		</section>
		${renderEvolutionDecision(snapshot)}`;
}

function renderEvolutionDecision(snapshot: PrototypeSessionSnapshot): string {
	const challenge = snapshot.challenge;
	if (!challenge) {
		return '';
	}

	if (snapshot.status !== SessionStatus.Passed) {
		return `<div class="sticky-actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.SelectSection}" data-section="${ChallengeSection.Build}">Return to current stage</button>
		</div>`;
	}

	if (challenge.isChallengeComplete) {
		return `<section class="card callout callout-passed">
			<p class="eyebrow">Challenge complete</p>
			<h2>You evolved one codebase through ${challenge.totalLevels} requirements.</h2>
			<p class="muted">The journey—not only the final implementation—is the learning artifact.</p>
		</section>
		<div class="sticky-actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.Restart}">Restart prototype</button>
		</div>`;
	}

	return `<section class="card">
		<p class="eyebrow">Choose your next move</p>
		<h2>Continue now, or improve the design first?</h2>
		<p class="small muted">Refactoring keeps the current requirement visible and requires another full check run.</p>
		<div class="actions">
			<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.BeginRefactor}">Refactor before continuing</button>
			<button class="action" type="button" data-action="${ChallengeViewAction.Next}" ${snapshot.canRevealNext ? '' : 'disabled'}>Reveal next requirement</button>
		</div>
	</section>`;
}

function statusLabel(status: SessionStatus): string {
	switch (status) {
		case SessionStatus.Idle:
			return 'Ready';
		case SessionStatus.Running:
			return 'Checking';
		case SessionStatus.Failed:
			return 'Needs work';
		case SessionStatus.Passed:
			return 'Passed';
		case SessionStatus.Refactoring:
			return 'Refactoring';
	}
}

function sectionDomId(section: ChallengeSection): string {
	return section.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function formatEnumLabel(value: TestRunMode): string {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function testStatusSymbol(status: TestCaseStatus): string {
	switch (status) {
		case TestCaseStatus.Queued:
			return '○';
		case TestCaseStatus.Running:
			return '◌';
		case TestCaseStatus.Passed:
			return '✓';
		case TestCaseStatus.Failed:
			return '×';
	}
}

function formatDuration(milliseconds: number): string {
	if (milliseconds < 1_000) {
		return `${milliseconds} ms`;
	}

	return `${(milliseconds / 1_000).toFixed(1)} s`;
}

function renderMarkdown(markdown: string): string {
	const html: string[] = [];
	const codeLines: string[] = [];
	let inCodeBlock = false;
	let inList = false;

	const closeList = () => {
		if (inList) {
			html.push('</ul>');
			inList = false;
		}
	};

	for (const line of markdown.replaceAll('\r\n', '\n').split('\n')) {
		if (line.startsWith('```')) {
			if (inCodeBlock) {
				html.push(`<pre class="code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
				codeLines.length = 0;
			} else {
				closeList();
			}
			inCodeBlock = !inCodeBlock;
			continue;
		}

		if (inCodeBlock) {
			codeLines.push(line);
			continue;
		}

		const heading = /^(#{1,3})\s+(.+)$/.exec(line);
		if (heading) {
			closeList();
			const level = heading[1].length;
			html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
			continue;
		}

		const listItem = /^-\s+(.+)$/.exec(line);
		if (listItem) {
			if (!inList) {
				html.push('<ul>');
				inList = true;
			}
			html.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`);
			continue;
		}

		closeList();
		if (line.trim()) {
			html.push(`<p>${renderInlineMarkdown(line)}</p>`);
		}
	}

	closeList();
	if (inCodeBlock) {
		html.push(`<pre class="code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
	}

	return html.join('\n');
}

function renderInlineMarkdown(value: string): string {
	return escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function removeLeadingHeading(markdown: string): string {
	return markdown.replace(/^#\s+[^\n]+\n+/, '');
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
