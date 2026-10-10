import * as vscode from 'vscode';
import type { MarkdownRenderer } from '../views/MarkdownRenderer';

const renderMarkdownCommand = 'markdown.api.render';

export class VsCodeMarkdownRenderer implements MarkdownRenderer {
	private readonly cache = new Map<string, Promise<string>>();

	public render(markdown: string): Promise<string> {
		const cached = this.cache.get(markdown);
		if (cached) {
			return cached;
		}

		const rendering = this.renderWithVsCode(markdown);
		this.cache.set(markdown, rendering);
		void rendering.catch(() => this.cache.delete(markdown));

		return rendering;
	}

	private async renderWithVsCode(markdown: string): Promise<string> {
		const html = await vscode.commands.executeCommand<unknown>(
			renderMarkdownCommand,
			markdown,
		);
		if (typeof html !== 'string') {
			throw new Error('VS Code Markdown rendering is unavailable.');
		}

		return html;
	}
}
