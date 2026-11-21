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
import { ChallengeSection } from '../application/ChallengeSection';
import type {
	ChangedFileImpactDto,
	LevelChangeImpactDto,
	LevelSectionDto,
} from '../backend/BackendTypes';
import { ChallengeViewAction } from './ChallengeViewAction';
import type { MarkdownRenderer } from './MarkdownRenderer';
import { renderBackendResults } from './challengeResultsView';
import { escapeHtml, removeLeadingHeading } from './viewFormatting';

export async function renderChallenge(
	markdownRenderer: MarkdownRenderer,
	catalog?: ChallengeCatalogSnapshot,
	attemptCatalog?: AttemptCatalogSnapshot,
	attemptSession?: AttemptSessionSnapshot,
): Promise<string> {
	if (attemptSession) {
		return renderAttemptSession(attemptSession, markdownRenderer);
	}
	return renderWelcome(catalog, attemptCatalog);
}

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
			<div class="actions"><button class="action" type="button" data-action="${ChallengeViewAction.RetryCatalog}">Retry</button></div>
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
			<div class="actions"><button class="action" type="button" data-action="${ChallengeViewAction.SelectChallenge}" data-challenge-id="${escapeHtml(challenge.id)}">Start challenge</button></div>
		</article>`).join('')}
	</section>`;
}

function renderAttemptCatalog(
	catalog: ChallengeCatalogSnapshot | undefined,
	attemptCatalog: AttemptCatalogSnapshot,
): string {
	const challenge = catalog?.challenges.find((item) => item.id === attemptCatalog.challengeId);
	const title = challenge?.title ?? attemptCatalog.challengeId ?? 'Challenge';
	const backButton = `<button class="action action-quiet" type="button" data-action="${ChallengeViewAction.BackToCatalog}">Back to challenges</button>`;

	if (attemptCatalog.status === AttemptCatalogStatus.Loading) {
		return `<section class="card attempt-catalog">
			<p class="eyebrow">${escapeHtml(title)}</p><h2>Your attempts</h2>
			<p class="small muted"><span class="spinner" aria-hidden="true"></span>Loading attempts…</p>
			<div class="actions">${backButton}</div>
		</section>`;
	}
	if (attemptCatalog.status === AttemptCatalogStatus.Failed) {
		return `<section class="card attempt-catalog">
			<p class="eyebrow">${escapeHtml(title)}</p><h2>Could not load your attempts</h2>
			<p class="small muted">${escapeHtml(attemptCatalog.errorMessage ?? 'Unknown server error.')}</p>
			<div class="actions"><button class="action" type="button" data-action="${ChallengeViewAction.RetryAttempts}">Retry</button>${backButton}</div>
		</section>`;
	}

	const attempts = attemptCatalog.attempts.length === 0
		? '<p class="small muted">You have not started this challenge yet.</p>'
		: `<div class="attempt-list">${attemptCatalog.attempts.map(renderAttemptSummary).join('')}</div>`;
	return `<section class="card attempt-catalog">
		<p class="eyebrow">${escapeHtml(title)}</p><h2>Your attempts</h2>
		${attempts}
		<div class="actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.StartNewAttempt}" data-challenge-id="${escapeHtml(attemptCatalog.challengeId ?? '')}">Start new attempt</button>
			${backButton}
		</div>
	</section>`;
}

function renderAttemptSummary(attempt: AttemptCatalogSnapshot['attempts'][number]): string {
	const isComplete = attempt.status === 'completed';
	return `<article class="attempt-summary">
		<div><strong>${isComplete ? 'Completed' : 'In progress'}</strong>
		<p class="small muted">${escapeHtml(attempt.activeLevelId.replaceAll('-', ' '))} · Updated ${escapeHtml(formatAttemptDate(attempt.updatedAt))}</p></div>
		<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.ContinueAttempt}" data-attempt-id="${escapeHtml(attempt.id)}">${isComplete ? 'Review attempt' : 'Continue'}</button>
	</article>`;
}

function formatAttemptDate(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

async function renderAttemptSession(
	snapshot: AttemptSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
	const levelNumber = snapshot.attempt.levels.findIndex(
		(progress) => progress.levelId === snapshot.level.id,
	) + 1;
	const completed = snapshot.attempt.status === 'completed';
	const activeContent = await renderAttemptSection(snapshot, markdownRenderer);

	return `<main class="shell">
		<div class="brand"><span class="brand-mark" aria-hidden="true">C</span> CodeArc</div>
		<header>
			<div class="stage-meta">
				<p class="eyebrow">Stage ${levelNumber} of ${snapshot.challenge.levelCount}</p>
				<span class="status status-${completed ? 'passed' : 'idle'}">${completed ? 'Completed' : 'In progress'}</span>
			</div>
			<h1>${escapeHtml(snapshot.challenge.title)}</h1>
			${renderProgress(snapshot)}
		</header>
		${renderTabs(snapshot)}
		<section role="tabpanel">${activeContent}</section>
		<div class="backend-view-footer"><button class="action action-quiet" type="button" data-action="${ChallengeViewAction.BackToCatalog}">Back to challenges</button></div>
	</main>`;
}

function renderProgress(snapshot: AttemptSessionSnapshot): string {
	const steps = Array.from({ length: snapshot.challenge.levelCount }, (_, index) => {
		const progress = snapshot.attempt.levels[index];
		if (!progress) {
			return `<span class="progress-step progress-step-locked" aria-label="Stage ${index + 1}: locked" title="Stage ${index + 1} is locked"></span>`;
		}
		const selected = progress.levelId === snapshot.level.id;
		const state = progress.status === 'completed' ? 'complete' : 'current';
		return `<button class="progress-step progress-step-${state}" type="button" aria-label="Stage ${index + 1}: ${state}${selected ? ', viewing' : ''}" ${selected ? 'aria-current="step"' : ''} data-action="${ChallengeViewAction.SelectAttemptLevel}" data-level-id="${escapeHtml(progress.levelId)}" title="View stage ${index + 1}"></button>`;
	}).join('');
	return `<nav class="progress-track" aria-label="Challenge stages">${steps}</nav>`;
}

function renderTabs(snapshot: AttemptSessionSnapshot): string {
	const stageNumber = snapshot.attempt.levels.findIndex(
		(progress) => progress.levelId === snapshot.level.id,
	) + 1;
	const visibleSections = Object.values(ChallengeSection).filter(
		(section) => section !== ChallengeSection.Changes || stageNumber > 1,
	);

	return `<nav class="tabs" role="tablist" aria-label="Challenge sections">
		${visibleSections.map((section) => {
			const selected = snapshot.selectedSection === section;
			const disabled = (
				section === ChallengeSection.Changes
				&& snapshot.level.status !== 'completed'
			) || (
				section === ChallengeSection.Design
				&& snapshot.level.designFeedback === null
			);
			return `<button class="tab" type="button" role="tab" aria-selected="${String(selected)}" tabindex="${selected ? '0' : '-1'}" data-action="${ChallengeViewAction.SelectSection}" data-section="${escapeHtml(section)}" ${disabled ? 'disabled title="Unlocks after this stage is completed"' : ''}>${escapeHtml(section)}${disabled ? ' · Locked' : ''}</button>`;
		}).join('')}
	</nav>`;
}

async function renderAttemptSection(
	snapshot: AttemptSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
	switch (snapshot.selectedSection) {
		case ChallengeSection.Build: {
			const active = snapshot.level.id === snapshot.attempt.activeLevelId;
			const sections = await Promise.all(
				snapshot.level.sections.map((section) => renderLevelSection(section, markdownRenderer)),
			);
			return `<section class="card" aria-labelledby="stage-title">
				<p class="eyebrow">${snapshot.level.status === 'completed' ? 'Completed requirement' : 'Current requirement'}</p>
				<h2 id="stage-title">${escapeHtml(snapshot.level.title)}</h2>
				<div class="level-sections">${sections.join('')}</div>
			</section>
			<div class="sticky-actions">
				<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.OpenWorkspace}">Open challenge folder</button>
				${active
					? `<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.RunChecks}">Run checks</button>
						<button class="action" type="button" data-action="${ChallengeViewAction.SubmitSolution}">Submit solution</button>`
					: `<button class="action" type="button" data-action="${ChallengeViewAction.SelectAttemptLevel}" data-level-id="${escapeHtml(snapshot.attempt.activeLevelId)}">Return to current stage</button>`}
			</div>`;
		}
		case ChallengeSection.Results:
			return renderBackendResults(snapshot);
		case ChallengeSection.Changes:
			return renderChangeImpact(snapshot);
		case ChallengeSection.Design: {
			if (snapshot.level.designFeedback === null) {
				return `<section class="card locked"><span class="lock" aria-hidden="true">◇</span><div><strong>Design is locked</strong><p class="small muted">Complete this stage to reveal its design tradeoffs.</p></div></section>`;
			}
			const feedback = await markdownRenderer.render(
				removeLeadingHeading(snapshot.level.designFeedback),
			);
			const currentStageAction = renderAttemptLevelSelector(snapshot);
			return `<section class="card"><p class="eyebrow">Design reflection</p><div class="markdown-content">${feedback}</div></section>
				${currentStageAction}`;
		}
	}
}

function renderChangeImpact(snapshot: AttemptSessionSnapshot): string {
	const stageNumber = snapshot.attempt.levels.findIndex(
		(progress) => progress.levelId === snapshot.level.id,
	) + 1;

	if (snapshot.changeImpact.status === 'failed') {
		return `<section class="card locked">
			<span class="lock" aria-hidden="true">!</span>
			<div><strong>Could not load code changes</strong>
			<p class="small muted">${escapeHtml(snapshot.changeImpact.error)}</p>
			<button class="action action-secondary" type="button" data-action="${ChallengeViewAction.RetryChangeImpact}">Retry</button></div>
		</section>`;
	}

	if (snapshot.changeImpact.status !== 'ready') {
		return `<section class="card loading-card">
			<div class="spinner" aria-hidden="true"></div>
			<div><strong>Loading code changes…</strong><p class="small muted">Comparing this completed stage with the previous one.</p></div>
		</section>`;
	}

	const impact = snapshot.changeImpact.value;
	const previousLevel = snapshot.attempt.levels[stageNumber - 2];
	const currentLevel = snapshot.attempt.levels[stageNumber - 1];
	const currentStageAction = renderAttemptLevelSelector(snapshot);
	return `<section class="card impact-view" aria-labelledby="impact-title">
		<div class="impact-heading">
			<p class="eyebrow">Code changes</p>
			<h2 id="impact-title"><span>${escapeHtml(formatLevelName(previousLevel.levelId))}</span><span class="impact-arrow" aria-hidden="true">→</span><span>${escapeHtml(formatLevelName(currentLevel.levelId))}</span></h2>
			<p class="impact-stage-label">Stage ${stageNumber - 1} → Stage ${stageNumber}</p>
		</div>
		<p class="impact-lede">The new requirement affected:</p>
		${renderImpactSummary(impact)}
		<p class="impact-legend" aria-label="Line-change legend"><span><strong class="impact-legend-added">+</strong> added lines</span><span><strong class="impact-legend-removed">−</strong> removed lines</span></p>
		<div class="impact-files">
			${impact.files.length === 0
				? '<p class="small muted">No source files changed.</p>'
				: impact.files.map(renderImpactFile).join('')}
		</div>
		<div class="impact-interpretation">
			<strong>This is not a score.</strong>
			<p>A larger change is not automatically worse. Consider why this requirement made these methods change together.</p>
		</div>
		${currentStageAction}
	</section>`;
}

function renderImpactSummary(impact: LevelChangeImpactDto): string {
	return `<dl class="impact-summary">
		<div><dt>${impact.summary.changedFileCount}</dt><dd>${impact.summary.changedFileCount === 1 ? 'file' : 'files'} changed</dd></div>
		<div><dt>${impact.summary.modifiedMethodCount}</dt><dd>existing ${impact.summary.modifiedMethodCount === 1 ? 'method' : 'methods'} modified</dd></div>
		<div><dt>${impact.summary.changedLineCount}</dt><dd>${impact.summary.changedLineCount === 1 ? 'line' : 'lines'} touched inside them</dd></div>
	</dl>`;
}

function renderImpactFile(file: ChangedFileImpactDto): string {
	const modifiedCount = file.modifiedMethods.length;
	return `<details class="impact-file" open>
		<summary class="impact-file-heading">
			<span class="impact-file-name"><span class="impact-file-chevron" aria-hidden="true"></span><code>${escapeHtml(file.path)}</code></span>
			<span class="impact-file-meta">${modifiedCount} existing ${modifiedCount === 1 ? 'method' : 'methods'} modified</span>
		</summary>
		<div class="impact-file-content">
		${modifiedCount === 0
			? '<p class="small muted">No existing methods were modified in this file.</p>'
			: `<ul class="impact-methods">
				${file.modifiedMethods.map((method) => `<li>
					<div class="impact-method-name"><span aria-hidden="true">ƒ</span><code>${escapeHtml(method.qualifiedName)}</code></div>
					<div class="impact-deltas" aria-label="${method.linesAdded} lines added and ${method.linesRemoved} lines removed">
						<span class="impact-added">+${method.linesAdded}</span>
						<span class="impact-removed">−${method.linesRemoved}</span>
					</div>
				</li>`).join('')}
			</ul>`}
		${renderMethodInventory(
			'New methods',
			'Excluded from the existing-method metric',
			file.addedMethods,
			'added',
		)}
		${renderMethodInventory(
			'Removed code',
			'Reported separately from modified methods',
			file.removedMethods,
			'removed',
		)}
		</div>
	</details>`;
}

function renderMethodInventory(
	label: string,
	note: string,
	methods: string[],
	kind: 'added' | 'removed',
): string {
	if (methods.length === 0) {
		return '';
	}

	const marker = kind === 'added' ? '+' : '−';
	return `<section class="impact-inventory impact-inventory-${kind}">
		<div class="impact-inventory-heading"><strong>${label}</strong><span>${note}</span></div>
		<ul>${methods.map((method) => `<li><span aria-hidden="true">${marker}</span><code>${escapeHtml(method)}</code></li>`).join('')}</ul>
	</section>`;
}

function formatLevelName(levelId: string): string {
	return levelId
		.split('-')
		.map((word) => word.length > 0
			? `${word[0].toUpperCase()}${word.slice(1)}`
			: word)
		.join(' ');
}

function renderAttemptLevelSelector(snapshot: AttemptSessionSnapshot): string {
	return snapshot.attempt.status !== 'completed'
		&& snapshot.level.id !== snapshot.attempt.activeLevelId
		? `<div class="sticky-actions">
			<button class="action" type="button" data-action="${ChallengeViewAction.CurrentStage}">Continue to current stage</button>
		</div>`
		: '';

}

async function renderLevelSection(
	section: LevelSectionDto,
	markdownRenderer: MarkdownRenderer,
): Promise<string> {
	const content = await markdownRenderer.render(removeLeadingHeading(section.content));
	const sectionId = `level-section-${section.id}`;
	if (section.display === LevelSectionDisplay.Static) {
		return `<section class="level-section level-section-static" aria-labelledby="${sectionId}"><h3 id="${sectionId}">${escapeHtml(section.title)}</h3><div class="level-section-content markdown-content">${content}</div></section>`;
	}
	const expanded = section.display === LevelSectionDisplay.Expanded;
	return `<details class="level-section level-section-collapsible" ${expanded ? 'open' : ''}><summary id="${sectionId}">${escapeHtml(section.title)}</summary><div class="level-section-content markdown-content" aria-labelledby="${sectionId}">${content}</div></details>`;
}
