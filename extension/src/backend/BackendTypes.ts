export type AttemptStatus = 'in_progress' | 'completed';

export type LevelProgressStatus = 'active' | 'completed';

export interface ChallengeSummaryDto {
	id: string;
	version: string;
	title: string;
	description: string;
	levelCount: number;
}

export interface LevelProgressDto {
	levelId: string;
	status: LevelProgressStatus;
	submissionCount: number;
	completedAt: string | null;
}

export interface AttemptSummaryDto {
	id: string;
	version: string;
	status: AttemptStatus;
	startedAt: string;
	updatedAt: string;
	completedAt: string | null;
	activeLevelId: string | null;
}

export interface AttemptDto {
	id: string;
	userId: string;
	challengeId: string;
	version: string;
	status: AttemptStatus;
	startedAt: string;
	updatedAt: string;
	completedAt: string | null;
	activeLevelId: string | null;
	levels: LevelProgressDto[];
}
