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
	latestUnlockedLevelNumber: number;
	totalLevels: number;
	isCurrentLevelComplete: boolean;
	isViewingLatestLevel: boolean;
	isLatestLevelComplete: boolean;
	canAdvance: boolean;
	isChallengeComplete: boolean;
}

export class ChallengeController {
	private challenge: LoadedChallenge | undefined;
	private latestUnlockedLevelIndex = 0;
	private selectedLevelIndex = 0;
	private isLatestLevelComplete = false;

	public constructor(private readonly repository: ChallengeRepository) {}

	public async start(): Promise<ChallengeSnapshot> {
		this.challenge = await this.repository.load();
		this.latestUnlockedLevelIndex = 0;
		this.selectedLevelIndex = 0;
		this.isLatestLevelComplete = false;

		return this.getSnapshot();
	}

	public completeCurrentLevel(): ChallengeSnapshot {
		this.requireChallenge();
		if (this.selectedLevelIndex !== this.latestUnlockedLevelIndex) {
			throw new Error('Return to the latest level before completing checks.');
		}

		this.isLatestLevelComplete = true;

		return this.getSnapshot();
	}

	public advanceToNextLevel(): ChallengeSnapshot {
		const challenge = this.requireChallenge();
		if (this.selectedLevelIndex !== this.latestUnlockedLevelIndex) {
			throw new Error('Return to the latest level before advancing.');
		}

		if (!this.isLatestLevelComplete) {
			throw new Error('Complete the current level before advancing.');
		}

		if (this.latestUnlockedLevelIndex >= challenge.levels.length - 1) {
			throw new Error('The challenge is already complete.');
		}

		this.latestUnlockedLevelIndex += 1;
		this.selectedLevelIndex = this.latestUnlockedLevelIndex;
		this.isLatestLevelComplete = false;

		return this.getSnapshot();
	}

	public selectLevel(levelNumber: number): ChallengeSnapshot {
		const challenge = this.requireChallenge();
		const levelIndex = levelNumber - 1;
		if (!Number.isInteger(levelNumber)
			|| levelIndex < 0
			|| levelIndex >= challenge.levels.length) {
			throw new Error(`Level ${levelNumber} does not exist.`);
		}

		if (levelIndex > this.latestUnlockedLevelIndex) {
			throw new Error('That level is still locked.');
		}

		this.selectedLevelIndex = levelIndex;

		return this.getSnapshot();
	}

	public getSnapshot(): ChallengeSnapshot {
		const challenge = this.requireChallenge();
		const level = challenge.levels[this.selectedLevelIndex];
		const isViewingLatestLevel = this.selectedLevelIndex === this.latestUnlockedLevelIndex;
		const isCurrentLevelComplete = this.selectedLevelIndex < this.latestUnlockedLevelIndex
			|| this.isLatestLevelComplete;
		const isLatestLevelFinal = this.latestUnlockedLevelIndex === challenge.levels.length - 1;

		return {
			id: challenge.manifest.id,
			title: challenge.manifest.title,
			description: challenge.manifest.description,
			starterPath: challenge.starterPath,
			entrypointPath: challenge.entrypointPath,
			currentLevel: this.createLevelSnapshot(level, isCurrentLevelComplete),
			currentLevelNumber: this.selectedLevelIndex + 1,
			latestUnlockedLevelNumber: this.latestUnlockedLevelIndex + 1,
			totalLevels: challenge.levels.length,
			isCurrentLevelComplete,
			isViewingLatestLevel,
			isLatestLevelComplete: this.isLatestLevelComplete,
			canAdvance: isViewingLatestLevel
				&& this.isLatestLevelComplete
				&& !isLatestLevelFinal,
			isChallengeComplete: this.isLatestLevelComplete && isLatestLevelFinal,
		};
	}

	private createLevelSnapshot(
		level: LoadedChallengeLevel,
		isLevelComplete: boolean,
	): CurrentLevelSnapshot {
		return {
			id: level.manifest.id,
			title: level.manifest.title,
			sections: level.sections,
			designFeedback: isLevelComplete
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
