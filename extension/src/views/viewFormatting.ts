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

export function renderMarkdown(markdown: string): string {
	const html: string[] = [];
	const codeLines: string[] = [];
	let inCodeBlock = false;
	let inList = false;

	const closeList = () => {
		if (inList) {
			html.push('</ul>');
			inList = false;
		}
	};

	for (const line of markdown.replaceAll('\r\n', '\n').split('\n')) {
		if (line.startsWith('```')) {
			if (inCodeBlock) {
				html.push(`<pre class="code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
				codeLines.length = 0;
			} else {
				closeList();
			}
			inCodeBlock = !inCodeBlock;
			continue;
		}

		if (inCodeBlock) {
			codeLines.push(line);
			continue;
		}

		const heading = /^(#{1,3})\s+(.+)$/.exec(line);
		if (heading) {
			closeList();
			const level = heading[1].length;
			html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
			continue;
		}

		const listItem = /^-\s+(.+)$/.exec(line);
		if (listItem) {
			if (!inList) {
				html.push('<ul>');
				inList = true;
			}
			html.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`);
			continue;
		}

		closeList();
		if (line.trim()) {
			html.push(`<p>${renderInlineMarkdown(line)}</p>`);
		}
	}

	closeList();
	if (inCodeBlock) {
		html.push(`<pre class="code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
	}

	return html.join('\n');
}

function renderInlineMarkdown(value: string): string {
	return escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');
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
