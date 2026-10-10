import type {
	ChallengeRepository,
	LoadedChallenge,
	LoadedChallengeLevel,
	LoadedLevelSection,
} from './Challenge';

export interface CurrentLevelSnapshot {
	id: string;
	title: string;
	sections: LoadedLevelSection[];
	designFeedback?: string;
	testsPath: string;
}

export interface ChallengeSnapshot {
	id: string;
	title: string;
	description: string;
	starterPath: string;
	entrypointPath: string;
	currentLevel: CurrentLevelSnapshot;
	currentLevelNumber: number;
	totalLevels: number;
	isCurrentLevelComplete: boolean;
	canAdvance: boolean;
	isChallengeComplete: boolean;
}

export class ChallengeController {
	private challenge: LoadedChallenge | undefined;
	private currentLevelIndex = 0;
	private isCurrentLevelComplete = false;

	public constructor(private readonly repository: ChallengeRepository) {}

	public async start(): Promise<ChallengeSnapshot> {
		this.challenge = await this.repository.load();
		this.currentLevelIndex = 0;
		this.isCurrentLevelComplete = false;

		return this.getSnapshot();
	}

	public completeCurrentLevel(): ChallengeSnapshot {
		this.requireChallenge();
		this.isCurrentLevelComplete = true;

		return this.getSnapshot();
	}

	public advanceToNextLevel(): ChallengeSnapshot {
		const challenge = this.requireChallenge();
		if (!this.isCurrentLevelComplete) {
			throw new Error('Complete the current level before advancing.');
		}

		if (this.currentLevelIndex >= challenge.levels.length - 1) {
			throw new Error('The challenge is already complete.');
		}

		this.currentLevelIndex += 1;
		this.isCurrentLevelComplete = false;

		return this.getSnapshot();
	}

	public getSnapshot(): ChallengeSnapshot {
		const challenge = this.requireChallenge();
		const level = challenge.levels[this.currentLevelIndex];
		const isFinalLevel = this.currentLevelIndex === challenge.levels.length - 1;

		return {
			id: challenge.manifest.id,
			title: challenge.manifest.title,
			description: challenge.manifest.description,
			starterPath: challenge.starterPath,
			entrypointPath: challenge.entrypointPath,
			currentLevel: this.createLevelSnapshot(level),
			currentLevelNumber: this.currentLevelIndex + 1,
			totalLevels: challenge.levels.length,
			isCurrentLevelComplete: this.isCurrentLevelComplete,
			canAdvance: this.isCurrentLevelComplete && !isFinalLevel,
			isChallengeComplete: this.isCurrentLevelComplete && isFinalLevel,
		};
	}

	private createLevelSnapshot(level: LoadedChallengeLevel): CurrentLevelSnapshot {
		return {
			id: level.manifest.id,
			title: level.manifest.title,
			sections: level.sections,
			designFeedback: this.isCurrentLevelComplete
				? level.designFeedback
				: undefined,
			testsPath: level.testsPath,
		};
	}

	private requireChallenge(): LoadedChallenge {
		if (!this.challenge) {
			throw new Error('Start a challenge before accessing its state.');
		}

		return this.challenge;
	}
}
