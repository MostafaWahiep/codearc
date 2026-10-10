import { randomBytes } from 'node:crypto';
import type { PrototypeSessionSnapshot } from '../application/PrototypeSession';
import { ChallengeViewAction } from './ChallengeViewAction';
import type { MarkdownRenderer } from './MarkdownRenderer';
import { renderChallenge } from './challengeViewContent';
import { challengeViewStyles } from './challengeViewStyles';

export async function createChallengeViewHtml(
	snapshot: PrototypeSessionSnapshot,
	markdownRenderer: MarkdownRenderer,
	resources: ChallengeViewResources = {},
): Promise<string> {
	const nonce = randomBytes(16).toString('base64');
	const body = await renderChallenge(snapshot, markdownRenderer);
	const styleSource = resources.cspSource
		? ` ${resources.cspSource}`
		: '';
	const markdownHighlightStylesheet = resources.markdownHighlightStylesheetUri
		? `<link rel="stylesheet" href="${resources.markdownHighlightStylesheetUri}">`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta
		http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src 'unsafe-inline'${styleSource}; script-src 'nonce-${nonce}';"
	>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CodeArc</title>
	${markdownHighlightStylesheet}
	<style>${challengeViewStyles}</style>
</head>
<body>
	${body}
	<script nonce="${nonce}">${createChallengeViewScript()}</script>
</body>
</html>`;
}

export interface ChallengeViewResources {
	readonly cspSource?: string;
	readonly markdownHighlightStylesheetUri?: string;
}

function createChallengeViewScript(): string {
	return `
const vscode = acquireVsCodeApi();
document.addEventListener('click', (event) => {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	const button = target.closest('button[data-action]');
	if (!button || button.disabled) {
		return;
	}

	const type = button.dataset.action;
	if (!type) {
		return;
	}

	if (type !== '${ChallengeViewAction.SelectSection}') {
		button.disabled = true;
	}

	vscode.postMessage({ type, section: button.dataset.section });
});

document.addEventListener('keydown', (event) => {
	if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
		return;
	}

	const target = event.target;
	if (!(target instanceof Element) || !target.matches('[role="tab"]')) {
		return;
	}

	const tabs = Array.from(document.querySelectorAll('[role="tab"]'))
		.filter((tab) => !tab.disabled);
	const currentIndex = tabs.indexOf(target);
	if (currentIndex < 0 || tabs.length === 0) {
		return;
	}

	event.preventDefault();
	let nextIndex;
	if (event.key === 'Home') {
		nextIndex = 0;
	} else if (event.key === 'End') {
		nextIndex = tabs.length - 1;
	} else if (event.key === 'ArrowRight') {
		nextIndex = (currentIndex + 1) % tabs.length;
	} else {
		nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
	}

	tabs[nextIndex].focus();
	tabs[nextIndex].click();
});
`;
}
