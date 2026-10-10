import * as assert from 'node:assert';
import type {
	ChallengeRepository,
	LoadedChallenge,
} from '../application/Challenge';
import { ChallengeController } from '../application/ChallengeController';

suite('ChallengeController', () => {
	test('starts at the first level with feedback hidden', async () => {
		const controller = createController();

		const snapshot = await controller.start();

		assert.strictEqual(snapshot.currentLevel.id, 'level-one');
		assert.strictEqual(snapshot.currentLevelNumber, 1);
		assert.strictEqual(snapshot.totalLevels, 2);
		assert.strictEqual(snapshot.currentLevel.designFeedback, undefined);
		assert.strictEqual(snapshot.canAdvance, false);
	});

	test('reveals feedback after completing a level', async () => {
		const controller = createController();
		await controller.start();

		const snapshot = controller.completeCurrentLevel();

		assert.strictEqual(snapshot.currentLevel.designFeedback, 'Level one feedback');
		assert.strictEqual(snapshot.canAdvance, true);
	});

	test('blocks progression before the current level is complete', async () => {
		const controller = createController();
		await controller.start();

		assert.throws(
			() => controller.advanceToNextLevel(),
			/Complete the current level before advancing/,
		);
	});

	test('advances and resets completion state for the next level', async () => {
		const controller = createController();
		await controller.start();
		controller.completeCurrentLevel();

		const snapshot = controller.advanceToNextLevel();

		assert.strictEqual(snapshot.currentLevel.id, 'level-two');
		assert.strictEqual(snapshot.currentLevelNumber, 2);
		assert.strictEqual(snapshot.isCurrentLevelComplete, false);
		assert.strictEqual(snapshot.currentLevel.designFeedback, undefined);
	});

	test('marks the challenge complete after its final level', async () => {
		const controller = createController();
		await controller.start();
		controller.completeCurrentLevel();
		controller.advanceToNextLevel();

		const snapshot = controller.completeCurrentLevel();

		assert.strictEqual(snapshot.isChallengeComplete, true);
		assert.strictEqual(snapshot.canAdvance, false);
		assert.throws(
			() => controller.advanceToNextLevel(),
			/The challenge is already complete/,
		);
	});
});

function createController(): ChallengeController {
	const repository: ChallengeRepository = {
		load: async () => createChallenge(),
	};

	return new ChallengeController(repository);
}

function createChallenge(): LoadedChallenge {
	return {
		manifest: {
			id: 'test-challenge',
			title: 'Test Challenge',
			description: 'A challenge used by controller tests.',
			starterPath: 'starter',
			entrypointPath: 'starter/main.py',
			levels: [
				{
					id: 'level-one',
					title: 'Level One',
					requirementPath: 'level-1/requirements.md',
					designFeedbackPath: 'level-1/design-feedback.md',
					testsPath: 'level-1/tests',
				},
				{
					id: 'level-two',
					title: 'Level Two',
					requirementPath: 'level-2/requirements.md',
					designFeedbackPath: 'level-2/design-feedback.md',
					testsPath: 'level-2/tests',
				},
			],
		},
		rootPath: '/challenge',
		starterPath: '/challenge/starter',
		entrypointPath: '/challenge/starter/main.py',
		levels: [
			{
				manifest: {
					id: 'level-one',
					title: 'Level One',
					requirementPath: 'level-1/requirements.md',
					designFeedbackPath: 'level-1/design-feedback.md',
					testsPath: 'level-1/tests',
				},
				requirement: 'Level one requirement',
				designFeedback: 'Level one feedback',
				testsPath: '/challenge/level-1/tests',
			},
			{
				manifest: {
					id: 'level-two',
					title: 'Level Two',
					requirementPath: 'level-2/requirements.md',
					designFeedbackPath: 'level-2/design-feedback.md',
					testsPath: 'level-2/tests',
				},
				requirement: 'Level two requirement',
				designFeedback: 'Level two feedback',
				testsPath: '/challenge/level-2/tests',
			},
		],
	};
}
