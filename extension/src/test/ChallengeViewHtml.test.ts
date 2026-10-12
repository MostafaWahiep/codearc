import * as assert from 'node:assert';
import { LevelSectionDisplay } from '@codearc/shared';
import {
	ChallengeSection,
	SessionStatus,
	type PrototypeSessionSnapshot,
} from '../application/PrototypeSession';
import {
	TestCategory,
	TestRunMode,
} from '../application/TestRunner';
import { renderChallenge } from '../views/challengeViewContent';
import { createChallengeViewHtml } from '../views/challengeViewHtml';
import { renderResults } from '../views/challengeResultsView';
import type { MarkdownRenderer } from '../views/MarkdownRenderer';
import { escapeHtml } from '../views/viewFormatting';

const markdownRenderer: MarkdownRenderer = {
	render: async (markdown) => `<div data-rendered-markdown>${escapeHtml(markdown)}</div>`,
};

suite('Challenge view rendering', () => {
	test('assembles the welcome document with styles and webview behavior', async () => {
		const html = await createChallengeViewHtml(
			createSnapshot({ challenge: undefined }),
			markdownRenderer,
			{
				cspSource: 'https://test.webview.example',
				markdownHighlightStylesheetUri: 'https://test.webview.example/highlight.css',
			},
		);

		assert.match(html, /Content-Security-Policy/);
		assert.match(html, /style-src 'unsafe-inline' https:\/\/test\.webview\.example/);
		assert.match(
			html,
			/<link rel="stylesheet" href="https:\/\/test\.webview\.example\/highlight\.css">/,
		);
		assert.match(html, /<style>[\s\S]*\.welcome/);
		assert.match(html, /acquireVsCodeApi\(\)/);
		assert.match(html, /Start search challenge/);
	});

	test('renders the current Build requirement with the Markdown renderer', async () => {
		const snapshot = createSnapshot();
		if (!snapshot.challenge) {
			assert.fail('Expected a challenge snapshot.');
		}
		snapshot.challenge.currentLevel.title = 'Stage <One>';
		snapshot.challenge.currentLevel.sections[0].content = [
			'# Hidden duplicate title',
			'',
			'Find <unsafe> content using `search`.',
		].join('\n');

		const html = await renderChallenge(snapshot, markdownRenderer);

		assert.match(html, /Stage &lt;One&gt;/);
		assert.match(html, /Find &lt;unsafe&gt; content using `search`\./);
		assert.match(html, /data-rendered-markdown/);
		assert.doesNotMatch(html, /Hidden duplicate title/);
		assert.match(html, /Open challenge folder/);
		assert.match(html, /<details class="level-section level-section-collapsible" open>/);
		assert.match(html, /<summary id="level-section-examples">Examples<\/summary>/);
		assert.ok(html.indexOf('Public API') < html.indexOf('What must work'));
		assert.ok(html.indexOf('What must work') < html.indexOf('Examples'));
		assert.match(html, /Next requirement is hidden/);
	});

	test('renders current and regression failures in Results', () => {
		const html = renderResults(createSnapshot({
			activeSection: ChallengeSection.Results,
			status: SessionStatus.Failed,
			latestTestResult: {
				passed: false,
				mode: TestRunMode.Simulated,
				attempt: 1,
				durationMilliseconds: 42,
				testCases: [
					{
						name: 'current behavior',
						category: TestCategory.Current,
						passed: false,
						durationMilliseconds: 20,
						details: 'Expected <new> behavior.',
					},
					{
						name: 'previous behavior',
						category: TestCategory.Regression,
						passed: true,
						durationMilliseconds: 22,
					},
				],
			},
		}));

		assert.match(html, /Current-stage checks/);
		assert.match(html, /Regression checks/);
		assert.match(html, /Expected &lt;new&gt; behavior\./);
		assert.match(html, /1 failed/);
	});

	test('renders completed levels as navigation and keeps future levels locked', async () => {
		const snapshot = createSnapshot();
		if (!snapshot.challenge) {
			assert.fail('Expected a challenge snapshot.');
		}
		snapshot.challenge.currentLevelNumber = 1;
		snapshot.challenge.latestUnlockedLevelNumber = 2;
		snapshot.challenge.isCurrentLevelComplete = true;
		snapshot.challenge.isViewingLatestLevel = false;
		snapshot.isEvolutionUnlocked = true;

		const html = await renderChallenge(snapshot, markdownRenderer);

		assert.match(html, /data-action="selectLevel"[\s\S]*?data-level-number="1"/);
		assert.match(html, /data-action="selectLevel"[\s\S]*?data-level-number="2"/);
		assert.doesNotMatch(html, /data-level-number="3"/);
		assert.match(html, /Viewing completed stage 1/);
		assert.match(html, /Return to stage 2/);
	});

	test('keeps Design feedback locked until the level passes', async () => {
		const lockedHtml = await renderChallenge(createSnapshot({
			activeSection: ChallengeSection.Design,
		}), markdownRenderer);
		const unlockedHtml = await renderChallenge(createSnapshot({
			activeSection: ChallengeSection.Design,
			status: SessionStatus.Passed,
			isEvolutionUnlocked: true,
			canRevealNext: true,
		}), markdownRenderer);

		assert.match(lockedHtml, /Design is locked/);
		assert.doesNotMatch(lockedHtml, /Consider an inverted index/);
		assert.match(unlockedHtml, /Consider an inverted index/);
		assert.match(unlockedHtml, /Reveal next requirement/);
	});
});

function createSnapshot(
	overrides: Partial<PrototypeSessionSnapshot> = {},
): PrototypeSessionSnapshot {
	return {
		activeSection: ChallengeSection.Build,
		status: SessionStatus.Idle,
		isEvolutionUnlocked: false,
		canRevealNext: false,
		challenge: {
			id: 'search-engine',
			title: 'Search Engine',
			description: 'Build a search engine.',
			starterPath: '/challenge/starter',
			entrypointPath: '/challenge/starter/search_engine.py',
			currentLevel: {
				id: 'single-term-search',
				title: 'Single-term search',
				sections: [
					{
						id: 'change',
						title: 'Why this changed',
						display: LevelSectionDisplay.Static,
						content: '# Context\n\nFind exact terms.',
					},
					{
						id: 'api',
						title: 'Public API',
						display: LevelSectionDisplay.Expanded,
						content: '`search(query)`',
					},
					{
						id: 'requirements',
						title: 'What must work',
						display: LevelSectionDisplay.Expanded,
						content: 'Match complete terms.',
					},
					{
						id: 'examples',
						title: 'Examples',
						display: LevelSectionDisplay.Collapsed,
						content: '`search("python")`',
					},
				],
				designFeedback: '# Reflection\n\nConsider an inverted index.',
				testsPath: '/challenge/level-1/tests',
			},
			currentLevelNumber: 1,
			latestUnlockedLevelNumber: 1,
			totalLevels: 3,
			isCurrentLevelComplete: false,
			isViewingLatestLevel: true,
			isLatestLevelComplete: false,
			canAdvance: false,
			isChallengeComplete: false,
		},
		...overrides,
	};
}
