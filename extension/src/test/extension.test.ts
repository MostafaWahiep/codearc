import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('activates after startup to restore an opened learner folder', () => {
		const extension = vscode.extensions.getExtension('undefined_publisher.codearc');
		if (!extension) {
			throw new Error('CodeArc extension is not installed in the test host.');
		}

		assert.ok(
			(extension.packageJSON.activationEvents as unknown[]).includes(
				'onStartupFinished',
			),
		);
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
