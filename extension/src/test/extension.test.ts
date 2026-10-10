import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('contributes the start challenge command', async () => {
		const commands = await vscode.commands.getCommands(true);

		if (!commands.includes('codearc.startChallenge')) {
			throw new Error('Start challenge command is not registered.');
		}
	});

	test('uses VS Code Markdown highlighting for Python fences', async () => {
		const html = await vscode.commands.executeCommand<unknown>(
			'markdown.api.render',
			'```python\nclass SearchEngine:\n    pass\n```',
		);

		assert.strictEqual(typeof html, 'string');
		assert.match(html as string, /class="[^"]*language-python/);
		assert.match(html as string, /hljs-keyword/);
	});
});
