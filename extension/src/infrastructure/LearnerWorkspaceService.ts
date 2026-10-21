import * as path from 'node:path';
import * as vscode from 'vscode';

export class LearnerWorkspaceService {
	private readonly templates = new Map<string, ChallengeWorkspaceTemplate>();

	public constructor(
		private readonly storageRoot: vscode.Uri,
		templates: ChallengeWorkspaceTemplate[] = [],
	) {
		for (const template of templates) {
			this.templates.set(template.challengeId, template);
		}
	}

	public async ensureWorkspace(challengeId: string): Promise<vscode.Uri> {
		const definition = this.getTemplate(challengeId);
		const relativeEntrypoint = path.relative(
			definition.starterPath,
			definition.entrypointPath,
		);

		if (
			path.isAbsolute(relativeEntrypoint) ||
			relativeEntrypoint.startsWith(`..${path.sep}`) ||
			relativeEntrypoint === '..'
		) {
			throw new Error('The challenge entrypoint must be inside its starter directory.');
		}

		const workspacesRoot = vscode.Uri.joinPath(this.storageRoot, 'learner-workspaces');
		const learnerRoot = vscode.Uri.joinPath(workspacesRoot, challengeId);
		const starterFile = vscode.Uri.joinPath(
			learnerRoot,
			...relativeEntrypoint.split(path.sep)
		);

		await vscode.workspace.fs.createDirectory(workspacesRoot);
		if (!(await uriExists(learnerRoot))) {
			await vscode.workspace.fs.copy(
				vscode.Uri.file(definition.starterPath),
				learnerRoot,
				{ overwrite: false },
			);
		}

		if (!(await uriExists(starterFile))) {
			throw new Error('The challenge starter entrypoint could not be found.');
		}

		return learnerRoot;
	}

	public async openWorkspace(challengeId: string): Promise<void> {
		const learnerRoot = await this.ensureWorkspace(challengeId);
		const definition = this.getTemplate(challengeId);
		const relativeEntrypoint = path.relative(
			definition.starterPath,
			definition.entrypointPath,
		);
		const starterFile = vscode.Uri.joinPath(
			learnerRoot,
			...relativeEntrypoint.split(path.sep),
		);

		const isAlreadyOpen = vscode.workspace.workspaceFolders?.some(
			(folder) => folder.uri.toString() === learnerRoot.toString(),
		) ?? false;

		if (!isAlreadyOpen) {
			await vscode.commands.executeCommand(
				'vscode.openFolder',
				learnerRoot,
				{ forceReuseWindow: true },
			);
			return;
		}

		const document = await vscode.workspace.openTextDocument(starterFile);
		await vscode.window.showTextDocument(document, { preview: false });
	}

	public async openTestCase(
		challengeId: string,
		testPath: string,
		testName: string,
	): Promise<void> {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(testName)) {
			throw new Error('The test name returned by the runner is invalid.');
		}

		const normalizedPath = path.normalize(testPath);
		const testsRoot = path.join('.codearc', 'tests');
		const relativeToTests = path.relative(testsRoot, normalizedPath);
		if (
			path.isAbsolute(normalizedPath)
			|| relativeToTests === '..'
			|| relativeToTests.startsWith(`..${path.sep}`)
		) {
			throw new Error('The test path returned by the runner is invalid.');
		}

		const learnerRoot = await this.ensureWorkspace(challengeId);
		const testFile = vscode.Uri.joinPath(
			learnerRoot,
			...normalizedPath.split(path.sep),
		);
		if (!(await uriExists(testFile))) {
			throw new Error('The public test file is missing. Run the tests again to recreate it.');
		}

		const document = await vscode.workspace.openTextDocument(testFile);
		const testLine = findTestLine(document, testName);
		await vscode.window.showTextDocument(document, {
			preview: false,
			selection: testLine === undefined
				? undefined
				: document.lineAt(testLine).range,
		});
	}

	private getTemplate(challengeId: string): ChallengeWorkspaceTemplate {
		const template = this.templates.get(challengeId);
		if (!template) {
			throw new Error(`No local starter is configured for challenge ${challengeId}.`);
		}
		return template;
	}
}

export interface ChallengeWorkspaceTemplate {
	challengeId: string;
	starterPath: string;
	entrypointPath: string;
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

function findTestLine(document: vscode.TextDocument, testName: string): number | undefined {
	const declaration = new RegExp(`^\\s*(?:async\\s+)?def\\s+${testName}\\s*\\(`);
	for (let line = 0; line < document.lineCount; line += 1) {
		if (declaration.test(document.lineAt(line).text)) {
			return line;
		}
	}
	return undefined;
}
