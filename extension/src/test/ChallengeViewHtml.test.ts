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

suite('Challenge view rendering', () => {
	test('assembles the welcome document with styles and webview behavior', () => {
		const html = createChallengeViewHtml(createSnapshot({ challenge: undefined }));

		assert.match(html, /Content-Security-Policy/);
		assert.match(html, /<style>[\s\S]*\.welcome/);
		assert.match(html, /acquireVsCodeApi\(\)/);
		assert.match(html, /Start search challenge/);
	});

	test('renders and escapes the current Build requirement', () => {
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

		const html = renderChallenge(snapshot);

		assert.match(html, /Stage &lt;One&gt;/);
		assert.match(html, /Find &lt;unsafe&gt; content using <code>search<\/code>\./);
		assert.doesNotMatch(html, /Hidden duplicate title/);
		assert.match(html, /Open code in editor/);
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

	test('keeps Design feedback locked until the level passes', () => {
		const lockedHtml = renderChallenge(createSnapshot({
			activeSection: ChallengeSection.Design,
		}));
		const unlockedHtml = renderChallenge(createSnapshot({
			activeSection: ChallengeSection.Design,
			status: SessionStatus.Passed,
			isEvolutionUnlocked: true,
			canRevealNext: true,
		}));

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
			totalLevels: 3,
			isCurrentLevelComplete: false,
			canAdvance: false,
			isChallengeComplete: false,
		},
		...overrides,
	};
}
