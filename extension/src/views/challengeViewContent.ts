import { LevelSectionDisplay } from '@codearc/shared';
import {
	AttemptCatalogStatus,
	type AttemptCatalogSnapshot,
} from '../application/AttemptCatalog';
import type { AttemptSessionSnapshot } from '../application/AttemptSession';
import {
	ChallengeCatalogStatus,
	type ChallengeCatalogSnapshot,
} from '../application/ChallengeCatalog';
import type { LoadedLevelSection } from '../application/Challenge';
import {
	ChallengeSection,
	SessionStatus,
	type PrototypeSessionSnapshot,
} from '../application/PrototypeSession';
import { ChallengeViewAction } from './ChallengeViewAction';
import type { MarkdownRenderer } from './MarkdownRenderer';
import { renderResults } from './challengeResultsView';
import {
	escapeHtml,
	removeLeadingHeading,
	sectionDomId,
	statusLabel,
} from './viewFormatting';

function renderWelcome(
	catalog?: ChallengeCatalogSnapshot,
	attemptCatalog?: AttemptCatalogSnapshot,
): string {
	const catalogContent = attemptCatalog?.challengeId
		? renderAttemptCatalog(catalog, attemptCatalog)
		: renderCatalog(catalog);
	return `<main class="welcome">
		<div class="welcome-mark" aria-hidden="true">C</div>
		<p class="eyebrow">Learn through change</p>
		<h1>CodeArc</h1>
		<p class="muted">Evolve one codebase as new requirements appear.</p>
			${catalogContent}
	</main>`;
}

function renderCatalog(catalog?: ChallengeCatalogSnapshot): string {
	if (!catalog || catalog.status === ChallengeCatalogStatus.Idle
		|| catalog.status === ChallengeCatalogStatus.Loading) {
		return '<p class="small muted">Loading challenges…</p>';
	}

	if (catalog.status === ChallengeCatalogStatus.Failed) {
		return `<section class="card">
			<h2>Could not load challenges</h2>
			<p class="small muted">${escapeHtml(catalog.errorMessage ?? 'Unknown server error.')}</p>
			<div class="actions">
				<button class="action" type="button" data-action="${ChallengeViewAction.RetryCatalog}">Retry</button>
			</div>
		</section>`;
	}

	if (catalog.challenges.length === 0) {
		return '<p class="small muted">No challenges are available yet.</p>';
	}

	return `<section class="challenge-catalog" aria-label="Available challenges">
		${catalog.challenges.map((challenge) => `<article class="card challenge-summary">
			<p class="eyebrow">${challenge.levelCount} ${challenge.levelCount === 1 ? 'stage' : 'stages'}</p>
			<h2>${escapeHtml(challenge.title)}</h2>
			<p class="small muted">${escapeHtml(challenge.description)}</p>
			<div class="actions">
				<button
					class="action"
					type="button"
					data-action="${ChallengeViewAction.SelectChallenge}"
					data-challenge-id="${escapeHtml(challenge.id)}"
				>Start challenge</button>
			</div>
		</article>`).join('')}
	</section>`;
}

function renderAttemptCatalog(
	catalog: ChallengeCatalogSnapshot | undefined,
	attemptCatalog: AttemptCatalogSnapshot,
): string {
	const challenge = catalog?.challenges.find(
		(item) => item.id === attemptCatalog.challengeId,
	);
	const title = challenge?.title ?? attemptCatalog.challengeId ?? 'Challenge';
	const backButton = `<button class="action action-quiet" type="button" data-action="${ChallengeViewAction.BackToCatalog}">Back to challenges</button>`;

	if (attemptCatalog.status === AttemptCatalogStatus.Loading) {
		return `<section class="card attempt-catalog">
			<p class="eyebrow">${escapeHtml(title)}</p>
			<h2>Your attempts</h2>
			<p class="small muted"><span class="spinner" aria-hidden="true"></span>Loading attempts…</p>
			<div class="actions">${backButton}</div>
		</section>`;
	}

	if (attemptCatalog.status === AttemptCatalogStatus.Failed) {
		return `<section class="card attempt-catalog">
			<p class="eyebrow">${escapeHtml(title)}</p>
			<h2>Could not load your attempts</h2>
			<p class="small muted">${escapeHtml(attemptCatalog.errorMessage ?? 'Unknown server error.')}</p>
			<div class="actions">
				<button class="action" type="button" data-action="${ChallengeViewAction.RetryAttempts}">Retry</button>
				${backButton}
			</div>
		</section>`;
	}

	const attempts = attemptCatalog.attempts.length === 0
		? '<p class="small muted">You have not started this challenge yet.</p>'
		: `<div class="attempt-list">${attemptCatalog.attempts.map(renderAttempt).join('')}</div>`;

	return `<section class="card attempt-catalog">
		<p class="eyebrow">${escapeHtml(title)}</p>
		<h2>Your attempts</h2>
		${attempts}
		<div class="actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.StartNewAttempt}" data-challenge-id="${escapeHtml(attemptCatalog.challengeId ?? '')}">Start new attempt</button>
			${backButton}
		</div>
	</section>`;
}

function renderAttempt(attempt: AttemptCatalogSnapshot['attempts'][number]): string {
	const isComplete = attempt.status === 'completed';
	const status = isComplete ? 'Completed' : 'In progress';
	const level = attempt.activeLevelId.replaceAll('-', ' ');
	const action = isComplete ? 'Review attempt' : 'Continue';

	return `<article class="attempt-summary">
		<div>
			<strong>${escapeHtml(status)}</strong>
			<p class="small muted">${escapeHtml(level)} · Updated ${escapeHtml(formatAttemptDate(attempt.updatedAt))}</p>
		</div>
		<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.ContinueAttempt}" data-attempt-id="${escapeHtml(attempt.id)}">${action}</button>
	</article>`;
}

function formatAttemptDate(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
export async function renderChallenge(
	snapshot: PrototypeSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
	catalog?: ChallengeCatalogSnapshot,
	attemptCatalog?: AttemptCatalogSnapshot,
	attemptSession?: AttemptSessionSnapshot,
): Promise<string> {
	if (attemptSession) {
		return renderBackendAttempt(attemptSession, markdownRenderer);
	}

	const challenge = snapshot.challenge;
	if (!challenge) {
		return renderWelcome(catalog, attemptCatalog);
	}

	const stageLabel = `Stage ${challenge.currentLevelNumber} of ${challenge.totalLevels}`;
	const activeSectionId = sectionDomId(snapshot.activeSection);
	const activeSection = await renderActiveSection(snapshot, markdownRenderer);

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
			${activeSection}
		</section>
	</main>`;
}

async function renderBackendAttempt(
	snapshot: AttemptSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
	const currentLevelNumber = snapshot.attempt.levels.findIndex(
		(progress) => progress.levelId === snapshot.level.id,
	) + 1;
	const statusClass = snapshot.attempt.status === 'completed' ? 'passed' : 'idle';
	const statusLabel = snapshot.attempt.status === 'completed'
		? 'Completed'
		: 'In progress';
	const activeContent = await renderBackendSection(snapshot, markdownRenderer);

	return `<main class="shell">
		<div class="brand"><span class="brand-mark" aria-hidden="true">C</span> CodeArc</div>
		<header>
			<div class="stage-meta">
				<p class="eyebrow">Stage ${currentLevelNumber} of ${snapshot.challenge.levelCount}</p>
				<span class="status status-${statusClass}">${statusLabel}</span>
			</div>
			<h1>${escapeHtml(snapshot.challenge.title)}</h1>
			${renderBackendProgress(snapshot)}
		</header>
		${renderBackendTabs(snapshot)}
		<section role="tabpanel">
			${activeContent}
		</section>
		<div class="backend-view-footer">
			<button class="action action-quiet" type="button" data-action="${ChallengeViewAction.BackToCatalog}">Back to challenges</button>
		</div>
	</main>`;
}

function renderBackendProgress(snapshot: AttemptSessionSnapshot): string {
	const steps = Array.from(
		{ length: snapshot.challenge.levelCount },
		(_, index) => {
			const progress = snapshot.attempt.levels[index];
			if (!progress) {
				return `<span
					class="progress-step progress-step-locked"
					aria-label="Stage ${index + 1}: locked"
					title="Stage ${index + 1} is locked"
				></span>`;
			}

			const selected = progress.levelId === snapshot.level.id;
			const state = progress.status === 'completed' ? 'complete' : 'current';
			return `<button
				class="progress-step progress-step-${state}"
				type="button"
				aria-label="Stage ${index + 1}: ${state}${selected ? ', viewing' : ''}"
				${selected ? 'aria-current="step"' : ''}
				data-action="${ChallengeViewAction.SelectAttemptLevel}"
				data-level-id="${escapeHtml(progress.levelId)}"
				title="View stage ${index + 1}"
			></button>`;
		},
	).join('');

	return `<nav class="progress-track" aria-label="Challenge stages">${steps}</nav>`;
}

function renderBackendTabs(snapshot: AttemptSessionSnapshot): string {
	return `<nav class="tabs" role="tablist" aria-label="Challenge sections">
		${Object.values(ChallengeSection).map((section) => {
			const selected = snapshot.selectedSection === section;
			const disabled = section === ChallengeSection.Design
				&& snapshot.level.designFeedback === null;
			return `<button
				class="tab"
				type="button"
				role="tab"
				aria-selected="${String(selected)}"
				tabindex="${selected ? '0' : '-1'}"
				data-action="${ChallengeViewAction.SelectSection}"
				data-section="${escapeHtml(section)}"
				${disabled ? 'disabled title="Unlocks after this stage is completed"' : ''}
			>${escapeHtml(section)}${disabled ? ' · Locked' : ''}</button>`;
		}).join('')}
	</nav>`;
}

async function renderBackendSection(
	snapshot: AttemptSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
	switch (snapshot.selectedSection) {
		case ChallengeSection.Build: {
			const sections = await Promise.all(
				snapshot.level.sections.map((section) =>
					renderLevelSection(section, markdownRenderer)),
			);
			return `<section class="card" aria-labelledby="backend-stage-title">
				<p class="eyebrow">${snapshot.level.status === 'completed' ? 'Completed requirement' : 'Current requirement'}</p>
				<h2 id="backend-stage-title">${escapeHtml(snapshot.level.title)}</h2>
				<div class="level-sections">${sections.join('')}</div>
			</section>`;
		}
		case ChallengeSection.Results:
			return `<section class="card">
				<p class="eyebrow">Test evidence</p>
				<h2>Local test execution is not connected yet</h2>
				<p class="small muted">The requirement is now loaded from the backend. The local runner will be connected in the next lifecycle step.</p>
			</section>`;
		case ChallengeSection.Design: {
			if (snapshot.level.designFeedback === null) {
				return `<section class="card locked">
					<span class="lock" aria-hidden="true">◇</span>
					<div><strong>Design is locked</strong><p class="small muted">Complete this stage to reveal its design tradeoffs.</p></div>
				</section>`;
			}
			const feedback = await markdownRenderer.render(
				removeLeadingHeading(snapshot.level.designFeedback),
			);
			return `<section class="card">
				<p class="eyebrow">Design reflection</p>
				<div class="markdown-content">${feedback}</div>
			</section>`;
		}
	}
}

function renderProgress(snapshot: PrototypeSessionSnapshot): string {
	const challenge = snapshot.challenge;
	if (!challenge) {
		return '';
	}

	const steps = Array.from({ length: challenge.totalLevels }, (_, index) => {
		const stage = index + 1;
		const state = stage < challenge.latestUnlockedLevelNumber
			? 'complete'
			: stage === challenge.latestUnlockedLevelNumber
				? challenge.isLatestLevelComplete ? 'complete' : 'current'
				: 'locked';
		const isSelected = stage === challenge.currentLevelNumber;
		const label = `Stage ${stage}: ${state}${isSelected ? ', viewing' : ''}`;

		if (stage <= challenge.latestUnlockedLevelNumber) {
			return `<button
				class="progress-step progress-step-${state}"
				type="button"
				aria-label="${label}"
				${isSelected ? 'aria-current="step"' : ''}
				data-action="${ChallengeViewAction.SelectLevel}"
				data-level-number="${stage}"
				title="View stage ${stage}"
			></button>`;
		}

		return `<span
			class="progress-step progress-step-${state}"
			aria-label="${label}"
			title="Stage ${stage} is locked"
		></span>`;
	}).join('');

	return `<nav
		class="progress-track"
		aria-label="Challenge levels. Viewing stage ${challenge.currentLevelNumber} of ${challenge.totalLevels}."
	>${steps}</nav>`;
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

async function renderActiveSection(
	snapshot: PrototypeSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
	switch (snapshot.activeSection) {
		case ChallengeSection.Build:
			return renderBuild(snapshot, markdownRenderer);
		case ChallengeSection.Results:
			return renderResults(snapshot);
		case ChallengeSection.Design:
			return renderDesign(snapshot, markdownRenderer);
	}
}


async function renderBuild(
	snapshot: PrototypeSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
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
	const historyNotice = !challenge.isViewingLatestLevel
		? `<div class="callout" role="status">
			<strong>Viewing completed stage ${challenge.currentLevelNumber}</strong>
			<p class="small">This requirement and its evidence are read-only. Your code has continued evolving in stage ${challenge.latestUnlockedLevelNumber}.</p>
		</div>`
		: '';
	const levelSections = await Promise.all(
		challenge.currentLevel.sections.map((section) =>
			renderLevelSection(section, markdownRenderer)),
	);

	return `${refactorNotice}${historyNotice}
		<section class="card" aria-labelledby="stage-title">
			<p class="eyebrow">${challenge.isViewingLatestLevel ? 'Current requirement' : 'Completed requirement'}</p>
			<h2 id="stage-title">${escapeHtml(challenge.currentLevel.title)}</h2>
			${challenge.isViewingLatestLevel ? `<div class="requirement-action">
				<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.OpenWorkspace}">Open challenge folder</button>
			</div>` : ''}
			<div class="level-sections">
				${levelSections.join('')}
			</div>
		</section>
		${challenge.isViewingLatestLevel && !challenge.isChallengeComplete ? `<section class="card card-flat locked">
			<span class="lock" aria-hidden="true">◇</span>
			<div>
				<strong>Next requirement is hidden</strong>
				<p class="small muted">It appears only after this stage passes and you review the design tradeoffs.</p>
			</div>
		</section>` : ''}
		${renderTaskAction(snapshot)}`;
}

async function renderLevelSection(
	section: LoadedLevelSection,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
	const content = await markdownRenderer.render(removeLeadingHeading(section.content));
	const sectionId = `level-section-${section.id}`;

	if (section.display === LevelSectionDisplay.Static) {
		return `<section class="level-section level-section-static" aria-labelledby="${sectionId}">
			<h3 id="${sectionId}">${escapeHtml(section.title)}</h3>
			<div class="level-section-content markdown-content">${content}</div>
		</section>`;
	}

	const isExpanded = section.display === LevelSectionDisplay.Expanded;
	return `<details class="level-section level-section-collapsible" ${isExpanded ? 'open' : ''}>
		<summary id="${sectionId}">${escapeHtml(section.title)}</summary>
		<div class="level-section-content markdown-content" aria-labelledby="${sectionId}">${content}</div>
	</details>`;
}

function renderTaskAction(snapshot: PrototypeSessionSnapshot): string {
	const challenge = snapshot.challenge;
	if (challenge && !challenge.isViewingLatestLevel) {
		return renderReturnToLatestLevel(challenge.latestUnlockedLevelNumber);
	}

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


async function renderDesign(
	snapshot: PrototypeSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
	const challenge = snapshot.challenge;
	if (!challenge || !snapshot.isEvolutionUnlocked) {
		return `<section class="card locked">
			<span class="lock" aria-hidden="true">◇</span>
			<div><strong>${escapeHtml(ChallengeSection.Design)} is locked</strong><p class="small muted">Pass this stage to reveal its design tradeoffs.</p></div>
		</section>`;
	}

	const feedback = challenge.currentLevel.designFeedback ?? '';
	const waitingForChecks = snapshot.status !== SessionStatus.Passed;
	const feedbackHtml = await markdownRenderer.render(removeLeadingHeading(feedback));

	return `${waitingForChecks ? `<div class="callout callout-refactor">
		<strong>Checkpoint still open</strong>
		<p class="small">The design reflection stays available, but the next requirement remains locked until your latest code passes.</p>
	</div>` : ''}
		<section class="card">
			<p class="eyebrow">Design reflection</p>
			<div class="markdown-content">${feedbackHtml}</div>
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

	if (!challenge.isViewingLatestLevel) {
		return renderReturnToLatestLevel(challenge.latestUnlockedLevelNumber);
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

function renderReturnToLatestLevel(levelNumber: number): string {
	return `<div class="sticky-actions">
		<button
			class="action"
			type="button"
			data-action="${ChallengeViewAction.SelectLevel}"
			data-level-number="${levelNumber}"
		>Return to stage ${levelNumber}</button>
	</div>`;
}
