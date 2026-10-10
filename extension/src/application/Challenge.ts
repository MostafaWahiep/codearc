import type {
	ChallengeLevelManifest,
	ChallengeManifest,
	LevelSectionDisplay,
} from '@codearc/shared';

export interface LoadedLevelSection {
	id: string;
	title: string;
	display: LevelSectionDisplay;
	content: string;
}

export interface LoadedChallengeLevel {
	manifest: ChallengeLevelManifest;
	sections: LoadedLevelSection[];
	designFeedback: string;
	testsPath: string;
}

export interface LoadedChallenge {
	manifest: ChallengeManifest;
	rootPath: string;
	starterPath: string;
	entrypointPath: string;
	levels: LoadedChallengeLevel[];
}

export interface ChallengeRepository {
	load(): Promise<LoadedChallenge>;
}
