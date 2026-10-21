export const challengeViewStyles = `
* { box-sizing: border-box; }

:root { color-scheme: light dark; }

body {
	margin: 0;
	color: var(--vscode-foreground);
	background: var(--vscode-sideBar-background);
	font-family: var(--vscode-font-family);
	font-size: var(--vscode-font-size);
	line-height: 1.5;
}

button { font: inherit; }
h1, h2, h3 { line-height: 1.3; }
h1 { margin: 3px 0 7px; font-size: 19px; }
h2 { margin: 0 0 10px; font-size: 15px; }
h3 { margin: 17px 0 7px; font-size: 13px; }
p { margin: 8px 0; }
ul { margin: 8px 0; padding-left: 20px; }

.shell { min-height: 100vh; padding: 14px 14px 90px; }

.brand {
	display: flex;
	align-items: center;
	gap: 7px;
	margin-bottom: 14px;
	color: var(--vscode-descriptionForeground);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.brand-mark {
	display: inline-grid;
	width: 18px;
	height: 18px;
	place-items: center;
	border-radius: 4px;
	color: var(--vscode-button-foreground);
	background: var(--vscode-button-background);
	font-size: 10px;
}

.eyebrow {
	margin: 0;
	color: var(--vscode-descriptionForeground);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.07em;
	text-transform: uppercase;
}

.stage-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.status {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 2px 7px;
	border: 1px solid var(--vscode-panel-border);
	border-radius: 999px;
	color: var(--vscode-descriptionForeground);
	font-size: 11px;
}

.status::before {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: currentColor;
	content: '';
}

.status-passed { color: var(--vscode-testing-iconPassed); }

.progress-track { display: flex; gap: 5px; margin: 13px 0 16px; }

.progress-step {
	flex: 1;
	height: 4px;
	min-width: 0;
	padding: 0;
	border: 0;
	border-radius: 999px;
	background: var(--vscode-panel-border);
}

button.progress-step { cursor: pointer; }
button.progress-step:hover { filter: brightness(1.25); }
.progress-step[aria-current='step'] {
	box-shadow: 0 0 0 1px var(--vscode-focusBorder);
	transform: scaleY(1.75);
}

.progress-step-complete { background: var(--vscode-testing-iconPassed); }
.progress-step-current { background: var(--vscode-progressBar-background); }

.tabs {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	margin: 0 -4px 14px;
	border-bottom: 1px solid var(--vscode-panel-border);
}

.tab {
	position: relative;
	padding: 8px 3px;
	border: 0;
	color: var(--vscode-descriptionForeground);
	background: transparent;
	cursor: pointer;
	font-size: 11px;
}

.tab:hover:not(:disabled) { color: var(--vscode-foreground); }
.tab[aria-selected='true'] { color: var(--vscode-foreground); }

.tab[aria-selected='true']::after {
	position: absolute;
	right: 5px;
	bottom: -1px;
	left: 5px;
	height: 2px;
	background: var(--vscode-focusBorder);
	content: '';
}

.tab:disabled { opacity: 0.45; cursor: not-allowed; }

.card {
	margin-top: 11px;
	padding: 12px;
	border: 1px solid var(--vscode-panel-border);
	border-radius: 6px;
	background: var(--vscode-editor-background);
}

.muted { color: var(--vscode-descriptionForeground); }
.small { font-size: 11px; }
.locked { display: flex; gap: 8px; align-items: flex-start; }
.lock { color: var(--vscode-descriptionForeground); }

.markdown-content pre {
	overflow-x: auto;
	padding: 9px;
	border-radius: 4px;
	background: var(--vscode-textCodeBlock-background);
	font-family: var(--vscode-editor-font-family);
	font-size: var(--vscode-editor-font-size);
	white-space: pre;
}

.markdown-content pre code {
	padding: 0;
	background: transparent;
}

code {
	padding: 1px 3px;
	font-family: var(--vscode-editor-font-family);
	background: var(--vscode-textCodeBlock-background);
}

.actions { display: grid; gap: 8px; margin-top: 12px; }
.challenge-catalog { margin-top: 12px; text-align: left; }
.challenge-summary h2 { margin-top: 4px; }
.attempt-catalog { text-align: left; }
.attempt-catalog h2 { margin-top: 4px; }
.attempt-list { margin-top: 10px; border-top: 1px solid var(--vscode-panel-border); }
.attempt-summary { padding: 11px 0; border-bottom: 1px solid var(--vscode-panel-border); }
.attempt-summary p { margin: 3px 0 8px; text-transform: capitalize; }
.attempt-summary .action { width: auto; }
.backend-view-footer { margin-top: 14px; }

.evidence-details { margin: 0; }
.evidence-details div {
	display: flex;
	justify-content: space-between;
	gap: 10px;
	padding: 5px 0;
	border-bottom: 1px solid var(--vscode-panel-border);
}
.evidence-details dt { color: var(--vscode-descriptionForeground); }
.evidence-details dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.level-sections {
	border-top: 1px solid var(--vscode-panel-border);
}

.level-section {
	border-bottom: 1px solid var(--vscode-panel-border);
}

.level-section:last-child { border-bottom: 0; }

.level-section-static { padding: 13px 1px; }
.level-section-static h3 { margin-top: 0; }

.level-section-collapsible summary {
	position: relative;
	padding: 11px 22px 11px 1px;
	cursor: pointer;
	font-size: 12px;
	font-weight: 600;
	list-style: none;
}

.level-section-collapsible summary::-webkit-details-marker { display: none; }

.level-section-collapsible summary::after {
	position: absolute;
	right: 3px;
	color: var(--vscode-descriptionForeground);
	content: '›';
	font-size: 18px;
	font-weight: 400;
	line-height: 1;
	transform: rotate(90deg);
	transition: transform 120ms ease-out;
}

.level-section-collapsible[open] summary::after { transform: rotate(-90deg); }

.level-section-collapsible summary:hover {
	color: var(--vscode-textLink-foreground);
}

.level-section-collapsible summary:focus-visible {
	outline: 1px solid var(--vscode-focusBorder);
	outline-offset: 2px;
}

.level-section-content { padding: 0 1px 12px; }
.level-section-content > :first-child { margin-top: 0; }
.level-section-content > :last-child { margin-bottom: 0; }

.action {
	width: 100%;
	padding: 8px 10px;
	border: 1px solid transparent;
	border-radius: 3px;
	color: var(--vscode-button-foreground);
	background: var(--vscode-button-background);
	cursor: pointer;
}

.action:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }

.action-secondary {
	border-color: var(--vscode-panel-border);
	color: var(--vscode-button-secondaryForeground);
	background: var(--vscode-button-secondaryBackground);
}

.action-secondary:hover:not(:disabled) {
	background: var(--vscode-button-secondaryHoverBackground);
}

.action-quiet {
	border-color: var(--vscode-panel-border);
	color: var(--vscode-foreground);
	background: transparent;
}

.action-quiet:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
.action:disabled { opacity: 0.65; cursor: wait; }

.sticky-actions {
	position: fixed;
	right: 0;
	bottom: 0;
	left: 0;
	z-index: 2;
	padding: 10px 14px 13px;
	border-top: 1px solid var(--vscode-panel-border);
	background: var(--vscode-sideBar-background);
}

.sticky-actions .action { margin: 0; }

.check-summary {
	display: flex;
	align-items: flex-start;
	gap: 9px;
}

.check-summary-content { min-width: 0; }

.check-icon {
	display: inline-grid;
	flex: 0 0 auto;
	width: 21px;
	height: 21px;
	place-items: center;
	border-radius: 50%;
	font-weight: 700;
}

.check-icon-passed {
	color: var(--vscode-testing-iconPassed);
	background: color-mix(in srgb, var(--vscode-testing-iconPassed) 15%, transparent);
}

.check-icon-failed {
	color: var(--vscode-testing-iconFailed);
	background: color-mix(in srgb, var(--vscode-testing-iconFailed) 15%, transparent);
}

.run-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
	color: var(--vscode-descriptionForeground);
	font-size: 11px;
}

.run-meta span {
	padding: 2px 7px;
	border: 1px solid var(--vscode-panel-border);
	border-radius: 999px;
}

.test-group { margin-top: 20px; }
.test-group-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
}
.test-group-heading > div { min-width: 0; }
.test-group-heading .eyebrow { margin-bottom: 2px; }
.test-group-heading h3 { margin: 0; }
.test-group-heading span {
	flex: 0 0 auto;
	color: var(--vscode-descriptionForeground);
	font-size: 10px;
}
.test-group-heading .group-status {
	display: inline-grid;
	width: 19px;
	height: 19px;
	place-items: center;
	border-radius: 50%;
	font-size: 12px;
	font-weight: 700;
}
.group-status-passed {
	color: var(--vscode-testing-iconPassed) !important;
	background: color-mix(in srgb, var(--vscode-testing-iconPassed) 15%, transparent);
}
.group-status-failed {
	color: var(--vscode-testing-iconFailed) !important;
	background: color-mix(in srgb, var(--vscode-testing-iconFailed) 15%, transparent);
}

.regression-levels {
	margin: 9px 0 0;
	padding: 0;
	list-style: none;
}
.regression-levels li {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	padding: 4px 0;
	color: var(--vscode-descriptionForeground);
	font-size: 11px;
}
.regression-levels strong { color: var(--vscode-foreground); }

.passed-tests { margin-top: 8px; }
.passed-tests summary {
	cursor: pointer;
	color: var(--vscode-descriptionForeground);
	font-size: 11px;
}
.passed-tests summary span { color: var(--vscode-testing-iconPassed); }

.test-list { margin: 7px 0 0; padding: 0; list-style: none; }
.test-case {
	min-width: 0;
	padding: 9px 0;
	border-top: 1px solid var(--vscode-panel-border);
}
.test-case-heading {
	display: flex;
	min-width: 0;
	align-items: flex-start;
	gap: 8px;
}
.test-mark {
	flex: 0 0 14px;
	font-weight: 700;
	text-align: center;
}
.test-case-copy {
	display: grid;
	min-width: 0;
	gap: 2px;
}
.test-name {
	font-weight: 600;
	line-height: 1.35;
	overflow-wrap: anywhere;
}
.test-level {
	width: fit-content;
	padding: 1px 5px;
	border-radius: 999px;
	color: var(--vscode-badge-foreground);
	background: var(--vscode-badge-background);
	font-size: 9px;
}
.test-case-passed .test-mark { color: var(--vscode-testing-iconPassed); }
.test-case-failed .test-mark { color: var(--vscode-testing-iconFailed); }

.test-failure,
.run-details {
	margin: 7px 0 0 22px;
	color: var(--vscode-descriptionForeground);
	font-size: 11px;
}
.run-details summary {
	width: fit-content;
	cursor: pointer;
	color: var(--vscode-textLink-foreground);
}
.failure-comparison {
	display: grid;
	gap: 6px;
}
.failure-comparison div {
	display: grid;
	min-width: 0;
	gap: 2px;
}
.failure-comparison span {
	color: var(--vscode-descriptionForeground);
	font-size: 9px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.failure-comparison code {
	display: block;
	padding: 5px 7px;
	overflow-wrap: anywhere;
	white-space: pre-wrap;
}
.failure-message {
	margin: 0;
	overflow-wrap: anywhere;
}
.test-source-link {
	margin-top: 7px;
	padding: 0;
	border: 0;
	color: var(--vscode-textLink-foreground);
	background: transparent;
	cursor: pointer;
	font-size: 11px;
	text-align: left;
}
.test-source-link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
.run-details { margin: 18px 0 0; }
.run-details .evidence-details { margin-top: 7px; }

.spinner {
	display: inline-block;
	width: 13px;
	height: 13px;
	margin-right: 7px;
	border: 2px solid var(--vscode-panel-border);
	border-top-color: var(--vscode-progressBar-background);
	border-radius: 50%;
	vertical-align: -2px;
	animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.welcome {
	display: grid;
	min-height: 75vh;
	padding: 20px;
	place-content: center;
	text-align: center;
}

.welcome-mark {
	display: inline-grid;
	width: 44px;
	height: 44px;
	margin: 0 auto 12px;
	place-items: center;
	border-radius: 11px;
	color: var(--vscode-button-foreground);
	background: var(--vscode-button-background);
	font-size: 20px;
	font-weight: 700;
}

`;
