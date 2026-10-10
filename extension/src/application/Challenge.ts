import type {
	ChallengeLevelManifest,
	ChallengeManifest,
} from '@codearc/shared';

export interface LoadedChallengeLevel {
	manifest: ChallengeLevelManifest;
	requirement: string;
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
