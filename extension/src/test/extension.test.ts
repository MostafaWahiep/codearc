import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('contributes the start challenge command', async () => {
		const commands = await vscode.commands.getCommands(true);

		if (!commands.includes('codearc.startChallenge')) {
			throw new Error('Start challenge command is not registered.');
		}
	});
});
