import type { BackendClient } from './BackendClient';
import {
	BackendConnectionError,
	BackendResponseError,
	InvalidBackendResponseError,
} from './BackendErrors';
import {
	parseAttempt,
	parseAttemptSummaries,
	parseChallengeSummaries,
} from './BackendResponseParser';
import type {
	AttemptDto,
	AttemptSummaryDto,
	ChallengeSummaryDto,
} from './BackendTypes';

export type BackendFetch = (
	url: string,
	init?: RequestInit,
) => Promise<Response>;

export class HttpBackendClient implements BackendClient {
	private readonly baseUrl: string;

	public constructor(
		baseUrl: string,
		private readonly fetcher: BackendFetch = globalThis.fetch,
	) {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		if (this.baseUrl.length === 0) {
			throw new Error('The CodeArc backend URL must not be empty.');
		}
	}

	public async listChallenges(): Promise<ChallengeSummaryDto[]> {
		const method = 'GET';
		const path = '/challenges';
		const response = await this.request(method, path);
		return parseChallengeSummaries(response, method, path);
	}

	public async listAttempts(
		userId: string,
		challengeId: string,
	): Promise<AttemptSummaryDto[]> {
		const method = 'GET';
		const query = new URLSearchParams({ userId, challengeId });
		const path = `/attempts?${query.toString()}`;
		const response = await this.request(method, path);
		return parseAttemptSummaries(response, method, path);
	}

	public async startAttempt(
		userId: string,
		challengeId: string,
	): Promise<AttemptDto> {
		const method = 'POST';
		const path = '/attempts';
		const response = await this.request(method, path, {
			userId,
			challengeId,
		});
		return parseAttempt(response, method, path);
	}

	public async getAttempt(attemptId: string): Promise<AttemptDto> {
		const method = 'GET';
		const path = `/attempts/${encodeURIComponent(attemptId)}`;
		const response = await this.request(method, path);
		return parseAttempt(response, method, path);
	}

	private async request(
		method: string,
		path: string,
		body?: Record<string, unknown>,
	): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetcher(`${this.baseUrl}${path}`, {
				method,
				headers: {
					Accept: 'application/json',
					...(body ? { 'Content-Type': 'application/json' } : {}),
				},
				body: body ? JSON.stringify(body) : undefined,
			});
		} catch (error) {
			throw new BackendConnectionError(this.baseUrl, error);
		}

		const responseBody = await this.readResponseBody(response, method, path);
		if (!response.ok) {
			throw new BackendResponseError(
				response.status,
				method,
				path,
				readServerErrorMessage(responseBody)
					?? `The CodeArc server returned HTTP ${response.status}.`,
			);
		}

		return responseBody;
	}

	private async readResponseBody(
		response: Response,
		method: string,
		path: string,
	): Promise<unknown> {
		let text: string;
		try {
			text = await response.text();
		} catch (error) {
			throw new InvalidBackendResponseError(
				method,
				path,
				'the response body could not be read',
				{ cause: error },
			);
		}

		if (text.length === 0) {
			return undefined;
		}

		try {
			return JSON.parse(text) as unknown;
		} catch (error) {
			throw new InvalidBackendResponseError(
				method,
				path,
				'the response body is not valid JSON',
				{ cause: error },
			);
		}
	}
}

function readServerErrorMessage(value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return undefined;
	}

	const message = (value as Record<string, unknown>).message;
	return typeof message === 'string' && message.length > 0
		? message
		: undefined;
}
