import { LevelSectionDisplay } from '@codearc/shared';
import { InvalidBackendResponseError } from './BackendErrors';
import type {
	AttemptDto,
	AttemptStatus,
	AttemptSummaryDto,
	ChallengeSummaryDto,
	LevelProgressDto,
	LevelProgressStatus,
	LevelSectionDto,
	VisibleLevelDto,
	PublicTestBundleDto,
	PublicTestCategory,
	TestSubmissionResultDto,
	TestSubmissionOutcome,
	StarterFilesDto,
} from './BackendTypes';

const attemptStatuses: AttemptStatus[] = ['in_progress', 'completed'];
const levelProgressStatuses: LevelProgressStatus[] = ['active', 'completed'];
const levelSectionDisplays = Object.values(LevelSectionDisplay);
const publicTestCategories: PublicTestCategory[] = ['current', 'regression'];
const testSubmissionOutcomes: TestSubmissionOutcome[] = ['tests_failed', 'level_completed', 'attempt_completed'];

export function parseChallengeSummaries(
	value: unknown,
	method: string,
	path: string,
): ChallengeSummaryDto[] {
	return parseResponse(method, path, () => {
		const items = expectArray(value, 'response');
		return items.map((item, index) => {
			const location = `response[${index}]`;
			const summary = expectObject(item, location);
			return {
				id: expectString(summary.id, `${location}.id`),
				version: expectString(summary.version, `${location}.version`),
				title: expectString(summary.title, `${location}.title`),
				description: expectString(
					summary.description,
					`${location}.description`,
				),
				levelCount: expectNonNegativeInteger(
					summary.levelCount,
					`${location}.levelCount`,
				),
			};
		});
	});
}

export function parseAttempt(
	value: unknown,
	method: string,
	path: string,
): AttemptDto {
	return parseResponse(method, path, () => {
		const attempt = expectObject(value, 'response');
		return {
			id: expectString(attempt.id, 'response.id'),
			userId: expectString(attempt.userId, 'response.userId'),
			challengeId: expectString(attempt.challengeId, 'response.challengeId'),
			version: expectString(attempt.version, 'response.version'),
			status: expectOneOf(attempt.status, attemptStatuses, 'response.status'),
			startedAt: expectString(attempt.startedAt, 'response.startedAt'),
			updatedAt: expectString(attempt.updatedAt, 'response.updatedAt'),
			completedAt: expectNullableString(
				attempt.completedAt,
				'response.completedAt',
			),
			activeLevelId: expectString(
				attempt.activeLevelId,
				'response.activeLevelId',
			),
			levels: expectArray(attempt.levels, 'response.levels').map(
				parseLevelProgress,
			),
		};
	});
}

export function parseAttemptSummaries(
	value: unknown,
	method: string,
	path: string,
): AttemptSummaryDto[] {
	return parseResponse(method, path, () => {
		const items = expectArray(value, 'response');
		return items.map((item, index) => {
			const location = `response[${index}]`;
			const attempt = expectObject(item, location);
			return {
				id: expectString(attempt.id, `${location}.id`),
				version: expectString(attempt.version, `${location}.version`),
				status: expectOneOf(
					attempt.status,
					attemptStatuses,
					`${location}.status`,
				),
				startedAt: expectString(attempt.startedAt, `${location}.startedAt`),
				updatedAt: expectString(attempt.updatedAt, `${location}.updatedAt`),
				completedAt: expectNullableString(
					attempt.completedAt,
					`${location}.completedAt`,
				),
				activeLevelId: expectString(
					attempt.activeLevelId,
					`${location}.activeLevelId`,
				),
			};
		});
	});
}

export function parseVisibleLevel(
	value: unknown,
	method: string,
	path: string,
): VisibleLevelDto {
	return parseResponse(method, path, () => {
		const level = expectObject(value, 'response');
		return {
			id: expectString(level.id, 'response.id'),
			title: expectString(level.title, 'response.title'),
			status: expectOneOf(
				level.status,
				levelProgressStatuses,
				'response.status',
			),
			sections: expectArray(level.sections, 'response.sections').map(
				parseLevelSection,
			),
			designFeedback: expectNullableString(
				level.designFeedback,
				'response.designFeedback',
			),
		};
	});
}

export function parsePublicTestBundle(
	value: unknown,
	method: string,
	path: string,
): PublicTestBundleDto {
	return parseResponse(method, path, () => {
		const bundle = expectObject(value, 'response');
		return {
			runner: expectOneOf(bundle.runner, ['pytest'], 'response.runner'),
			files: expectArray(bundle.files, 'response.files').map((value, index) => {
				const location = `response.files[${index}]`;
				const file = expectObject(value, location);
				return {
					levelId: expectString(file.levelId, `${location}.levelId`),
					path: expectString(file.path, `${location}.path`),
					content: expectStringValue(file.content, `${location}.content`),
					category: expectOneOf(
						file.category,
						publicTestCategories,
						`${location}.category`,
					),
				};
			}),
		};
	});
}

export function parseTestResult(
	value: unknown,
	method: string,
	path: string,
): TestSubmissionResultDto {
	return parseResponse(method, path, () => {
		const result = expectObject(value, 'response');
		return {
			outcome: expectOneOf(
				result.outcome,
				testSubmissionOutcomes,
				'response.outcome',
			),
			attempt: parseAttempt(result.attempt, method, path),
			completedLevelId: expectNullableString(
				result.completedLevelId,
				'response.completedLevelId',
			),
		};
	});
}

export function parseStarterFiles(
	value: unknown,
	method: string,
	path: string,
): StarterFilesDto {
	return parseResponse(method, path, () => {
		const starterFiles = expectObject(value, 'response');
		return {
			challengeId: expectString(starterFiles.challengeId, 'response.challengeId'),
			version: expectString(starterFiles.version, 'response.version'),
			entrypoint: expectString(starterFiles.entrypoint, 'response.entrypoint'),
			files: expectArray(starterFiles.files, 'response.files').map((file, index) => {
				const location = `response.files[${index}]`;
				const starterFile = expectObject(file, location);
				return {
					filePath: expectString(starterFile.filePath, `${location}.filePath`),
					content: expectString(starterFile.content, `${location}.content`),
				};
			}),
		};
	});
}

function parseLevelSection(value: unknown, index: number): LevelSectionDto {
	const location = `response.sections[${index}]`;
	const section = expectObject(value, location);
	return {
		id: expectString(section.id, `${location}.id`),
		title: expectString(section.title, `${location}.title`),
		content: expectString(section.content, `${location}.content`),
		display: expectOneOf(
			section.display,
			levelSectionDisplays,
			`${location}.display`,
		),
	};
}

function parseLevelProgress(value: unknown, index: number): LevelProgressDto {
	const location = `response.levels[${index}]`;
	const progress = expectObject(value, location);
	return {
		levelId: expectString(progress.levelId, `${location}.levelId`),
		status: expectOneOf(
			progress.status,
			levelProgressStatuses,
			`${location}.status`,
		),
		submissionCount: expectNonNegativeInteger(
			progress.submissionCount,
			`${location}.submissionCount`,
		),
		completedAt: expectNullableString(
			progress.completedAt,
			`${location}.completedAt`,
		),
	};
}

function parseResponse<T>(
	method: string,
	path: string,
	parse: () => T,
): T {
	try {
		return parse();
	} catch (error) {
		if (error instanceof ResponseShapeError) {
			throw new InvalidBackendResponseError(
				method,
				path,
				error.message,
				{ cause: error },
			);
		}

		throw error;
	}
}

function expectObject(value: unknown, location: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new ResponseShapeError(`${location} must be an object`);
	}

	return value as Record<string, unknown>;
}

function expectArray(value: unknown, location: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new ResponseShapeError(`${location} must be an array`);
	}

	return value;
}

function expectString(value: unknown, location: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new ResponseShapeError(`${location} must be a non-empty string`);
	}

	return value;
}

function expectStringValue(value: unknown, location: string): string {
	if (typeof value !== 'string') {
		throw new ResponseShapeError(`${location} must be a string`);
	}
	return value;
}

function expectNullableString(value: unknown, location: string): string | null {
	if (value === null) {
		return null;
	}

	return expectString(value, location);
}

function expectNonNegativeInteger(value: unknown, location: string): number {
	if (!Number.isInteger(value) || typeof value !== 'number' || value < 0) {
		throw new ResponseShapeError(`${location} must be a non-negative integer`);
	}

	return value;
}

function expectOneOf<T extends string>(
	value: unknown,
	allowed: T[],
	location: string,
): T {
	if (typeof value !== 'string' || !allowed.includes(value as T)) {
		throw new ResponseShapeError(
			`${location} must be one of: ${allowed.join(', ')}`,
		);
	}

	return value as T;
}

class ResponseShapeError extends Error {}
