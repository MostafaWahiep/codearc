import type { LevelSectionDisplay } from '@codearc/shared';

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

export interface LevelSectionDto {
	id: string;
	title: string;
	content: string;
	display: LevelSectionDisplay;
}

export interface VisibleLevelDto {
	id: string;
	title: string;
	status: LevelProgressStatus;
	sections: LevelSectionDto[];
	designFeedback: string | null;
}

export type PublicTestCategory = 'current' | 'regression';

export interface PublicTestFileDto {
	levelId: string;
	path: string;
	content: string;
	category: PublicTestCategory;
}

export interface PublicTestBundleDto {
	runner: 'pytest';
	files: PublicTestFileDto[];
}

export interface AttemptSummaryDto {
	id: string;
	version: string;
	status: AttemptStatus;
	startedAt: string;
	updatedAt: string;
	completedAt: string | null;
	activeLevelId: string;
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
	activeLevelId: string;
	levels: LevelProgressDto[];
}

export interface TestSubmission {
	levelId: string;
	exitCode: number;
	timedOut: boolean;
	passedCount: number;
	failedCount: number;
}

export type TestSubmissionOutcome = 'tests_failed' | 'level_completed' | 'attempt_completed';

export interface TestSubmissionResultDto {
	outcome: TestSubmissionOutcome;
	attempt: AttemptDto;
	completedLevelId: string | null;
}

export interface StarterFileDto {
	filePath: string;
	content: string;
}

export interface StarterFilesDto {
	challengeId: string;
	version: string;
	entrypoint: string;
	files: StarterFileDto[];
}
