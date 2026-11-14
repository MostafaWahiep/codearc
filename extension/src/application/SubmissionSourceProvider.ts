import type { AttemptDto, SubmissionSourceFile } from '../backend/BackendTypes';

export interface SubmissionSourceProvider {
	collect(attempt: AttemptDto): Promise<SubmissionSourceFile[]>;
}
