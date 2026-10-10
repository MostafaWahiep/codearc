import { ChallengeSection, SessionStatus } from '../application/PrototypeSession';
import { TestCaseStatus, TestRunMode } from '../application/TestRunner';

export function statusLabel(status: SessionStatus): string {
	switch (status) {
		case SessionStatus.Idle:
			return 'Ready';
		case SessionStatus.Running:
			return 'Checking';
		case SessionStatus.Failed:
			return 'Needs work';
		case SessionStatus.Passed:
			return 'Passed';
		case SessionStatus.Refactoring:
			return 'Refactoring';
	}
}
export function sectionDomId(section: ChallengeSection): string {
	return section.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function formatEnumLabel(value: TestRunMode): string {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function testStatusSymbol(status: TestCaseStatus): string {
	switch (status) {
		case TestCaseStatus.Queued:
			return '○';
		case TestCaseStatus.Running:
			return '◌';
		case TestCaseStatus.Passed:
			return '✓';
		case TestCaseStatus.Failed:
			return '×';
	}
}

export function formatDuration(milliseconds: number): string {
	if (milliseconds < 1_000) {
		return `${milliseconds} ms`;
	}

	return `${(milliseconds / 1_000).toFixed(1)} s`;
}

export function removeLeadingHeading(markdown: string): string {
	return markdown.replace(/^#\s+[^\n]+\n+/, '');
}

export function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
