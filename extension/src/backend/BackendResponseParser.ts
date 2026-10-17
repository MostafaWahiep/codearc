import { InvalidBackendResponseError } from './BackendErrors';
import type {
	AttemptDto,
	AttemptStatus,
	AttemptSummaryDto,
	ChallengeSummaryDto,
	LevelProgressDto,
	LevelProgressStatus,
} from './BackendTypes';

const attemptStatuses: AttemptStatus[] = ['in_progress', 'completed'];
const levelProgressStatuses: LevelProgressStatus[] = ['active', 'completed'];

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
			activeLevelId: expectNullableString(
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
				activeLevelId: expectNullableString(
					attempt.activeLevelId,
					`${location}.activeLevelId`,
				),
			};
		});
	});
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
