export interface MarkdownRenderer {
	render(markdown: string): Promise<string>;
}
