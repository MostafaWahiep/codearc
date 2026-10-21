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
