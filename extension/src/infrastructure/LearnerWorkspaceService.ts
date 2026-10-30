import * as path from 'node:path';
import * as vscode from 'vscode';
import { AttemptDto } from '../backend/BackendTypes';
import { BackendClient } from '../backend/BackendClient';

export interface WorkspaceEntry {
	attemptId: string;
	attemptRootUri: vscode.Uri;
	challengeRootUri: vscode.Uri;
	entrypointUri: vscode.Uri;
	challengeId: string;
}

export interface OpenFolderOptions {
	forceNewWindow?: boolean;
	forceReuseWindow?: boolean;
}

export class LearnerWorkspaceService {
	private workspace: WorkspaceEntry | undefined;
	private readonly attemptMetadataFileName = 'attempt.json';

	public constructor(
		private readonly storageRoot: vscode.Uri,
		private readonly backendClient: BackendClient,
		private readonly getWorkspaceFolders: () => readonly vscode.WorkspaceFolder[] | undefined = (
			() => vscode.workspace.workspaceFolders
		),
		private readonly getWorkspaceFile: () => vscode.Uri | undefined = (
			() => vscode.workspace.workspaceFile
		),
		private readonly openFolder: (
			folder: vscode.Uri,
			options: OpenFolderOptions,
		) => Promise<void> = async (folder, options) => {
			await vscode.commands.executeCommand(
				'vscode.openFolder',
				folder,
				options,
			);
		},
	) {}

	public async findOpenedAttemptWorkspace(): Promise<WorkspaceEntry | undefined> {
		const workspaceFolders = this.getWorkspaceFolders();
		if (workspaceFolders?.length !== 1) {
			return undefined;
		}

		const challengeRoot = workspaceFolders[0].uri;
		const workspacesRoot = this.getWorkspacesRoot();
		if (
			challengeRoot.scheme !== workspacesRoot.scheme
			|| challengeRoot.authority !== workspacesRoot.authority
		) {
			return undefined;
		}

		const relativePath = path.relative(
			workspacesRoot.fsPath,
			challengeRoot.fsPath,
		);
		if (
			!relativePath
			|| path.isAbsolute(relativePath)
			|| relativePath === '..'
			|| relativePath.startsWith(`..${path.sep}`)
		) {
			return undefined;
		}

		const pathParts = relativePath.split(path.sep);
		if (pathParts.length !== 2) {
			return undefined;
		}

		const [attemptId, challengeId] = pathParts;
		const attemptRoot = vscode.Uri.joinPath(workspacesRoot, attemptId);
		const metadata = await this.readAttemptMetadata(attemptRoot);
		if (
			metadata.attemptId !== attemptId
			|| metadata.challengeId !== challengeId
		) {
			throw new Error('The opened learner folder does not match its attempt metadata.');
		}

		const relativeEntrypoint = normalizeRelativePath(
			metadata.entrypoint,
			'attempt entrypoint',
		);
		const entrypoint = vscode.Uri.joinPath(challengeRoot, relativeEntrypoint);
		if (!(await uriExists(entrypoint))) {
			throw new Error(`Entrypoint not found for attempt ${attemptId}.`);
		}

		return {
			attemptId,
			attemptRootUri: attemptRoot,
			challengeRootUri: challengeRoot,
			entrypointUri: entrypoint,
			challengeId,
		};
	}

	public async ensureWorkspace(attempt: AttemptDto): Promise<WorkspaceEntry> {
		if (this.workspace?.attemptId === attempt.id) {
			return this.workspace;
		}

		const workspacesRoot = this.getWorkspacesRoot();
		const attemptRoot = vscode.Uri.joinPath(workspacesRoot, attempt.id);
		const challengeRoot = vscode.Uri.joinPath(attemptRoot, attempt.challengeId);

		if (!(await uriExists(challengeRoot))) {
			await this.createWorkspace(attempt);

			if (!this.workspace) {
				throw new Error(`Workspace creation failed for attempt ${attempt.id}.`);
			}

			return this.workspace;
		}

		const attemptMetadata = await this.readAttemptMetadata(attemptRoot);

		if (
			attemptMetadata.attemptId !== attempt.id
			|| attemptMetadata.challengeId !== attempt.challengeId
			|| attemptMetadata.challengeVersion !== attempt.version
		) {
			throw new Error(`Attempt metadata mismatch for attempt ${attempt.id}`);
		}

		const relativeEntrypoint = normalizeRelativePath(
			attemptMetadata.entrypoint,
			'attempt entrypoint',
		);
		const entrypoint = vscode.Uri.joinPath(challengeRoot, relativeEntrypoint);

		if (!(await uriExists(entrypoint))) {
			throw new Error(`Entrypoint not found for attempt ${attempt.id}.`);
		}

		this.workspace = {
			attemptId: attempt.id,
			attemptRootUri: attemptRoot,
			challengeRootUri: challengeRoot,
			entrypointUri: entrypoint,
			challengeId: attempt.challengeId,
		};

		return this.workspace;
	}

	public async openWorkspace(attempt: AttemptDto): Promise<void> {
		const workspace = await this.ensureWorkspace(attempt);
		const workspaceFolders = this.getWorkspaceFolders();

		const isWindowEmpty =
			(workspaceFolders?.length ?? 0) === 0
			&& this.getWorkspaceFile() === undefined;

		if (isWindowEmpty) {
			await this.openFolder(
				workspace.challengeRootUri,
				{ forceReuseWindow: true },
			);
			return;
		}

		const isAlreadyOpen = workspaceFolders?.some(
			(folder) => folder.uri.toString() === workspace.challengeRootUri.toString(),
		) ?? false;

		if (!isAlreadyOpen) {
			await this.openFolder(
				workspace.challengeRootUri,
				{ forceNewWindow: true },
			);
			return;
		}

		await this.openEntrypoint(attempt);
	}

	public async openEntrypoint(attempt: AttemptDto): Promise<void> {
		const workspace = await this.ensureWorkspace(attempt);
		const document = await vscode.workspace.openTextDocument(workspace.entrypointUri);
		await vscode.window.showTextDocument(document, { preview: false });
	}

	public async createWorkspace(
		attempt: AttemptDto,
	): Promise<void> {
		const workspacesRoot = this.getWorkspacesRoot();
		const attemptRoot = vscode.Uri.joinPath(workspacesRoot, attempt.id);
		const challengeRoot = vscode.Uri.joinPath(attemptRoot, attempt.challengeId);

		if ((await uriExists(attemptRoot))) {
			throw new Error(`Workspace for attempt ${attempt.id} already exists.`);
		}

		const starterFiles = await this.backendClient.getStarterFiles(
			attempt.challengeId,
			attempt.version,
		);

		try {
			await vscode.workspace.fs.createDirectory(attemptRoot);
			await vscode.workspace.fs.createDirectory(challengeRoot);

			for (const starterFile of starterFiles.files) {
				const relativePath = normalizeRelativePath(
					starterFile.filePath,
					'starter file',
				);
				const targetPath = vscode.Uri.joinPath(challengeRoot, relativePath);
				const dirPath = vscode.Uri.joinPath(targetPath, '..');

				const binaryData = Buffer.from(starterFile.content, 'utf-8');
				await vscode.workspace.fs.createDirectory(dirPath);
				await vscode.workspace.fs.writeFile(targetPath, binaryData);
			}

			await this.writeAttemptMetadata(
				attempt,
				starterFiles.entrypoint,
				attemptRoot,
			);

			const relativeEntrypoint = normalizeRelativePath(
				starterFiles.entrypoint,
				'challenge entrypoint',
			);
			const entrypointUri = vscode.Uri.joinPath(challengeRoot, relativeEntrypoint);
			if (!(await uriExists(entrypointUri))) {
				throw new Error(`Entrypoint not found for attempt ${attempt.id}.`);
			}

			this.workspace = {
				attemptId: attempt.id,
				attemptRootUri: attemptRoot,
				challengeRootUri: challengeRoot,
				entrypointUri,
				challengeId: attempt.challengeId,
			};
		} catch (error) {
			if (await uriExists(attemptRoot)) {
				await vscode.workspace.fs.delete(attemptRoot, { recursive: true });
			}
			throw error;
		}
	}

	public async openTestCase(
		attempt: AttemptDto,
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

		const workspace = await this.ensureWorkspace(attempt);
		const testFile = vscode.Uri.joinPath(
			workspace.challengeRootUri,
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

	private async writeAttemptMetadata(
		attempt: AttemptDto,
		entrypoint: string,
		attemptRoot: vscode.Uri,
	): Promise<void> {
		const metadata = {
			schemaVersion: 1,
			attemptId: attempt.id,
			challengeId: attempt.challengeId,
			challengeVersion: attempt.version,
			entrypoint: entrypoint,
		};

		const filePath = vscode.Uri.joinPath(attemptRoot, this.attemptMetadataFileName);
		const content = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');

		await vscode.workspace.fs.writeFile(filePath, content);
	}

	private async readAttemptMetadata(
		attemptRoot: vscode.Uri,
	): Promise<AttemptWorkspaceMetadata> {
		const filePath = vscode.Uri.joinPath(
			attemptRoot,
			this.attemptMetadataFileName,
		);
		if (!(await uriExists(filePath))) {
			throw new Error(
				`Attempt metadata not found in ${attemptRoot.fsPath}.`,
			);
		}

		let value: unknown;
		try {
			const fileBytes = await vscode.workspace.fs.readFile(filePath);
			value = JSON.parse(Buffer.from(fileBytes).toString('utf8'));
		} catch (error) {
			throw new Error(`Could not read attempt metadata in ${attemptRoot.fsPath}.`, {
				cause: error,
			});
		}

		if (!isAttemptWorkspaceMetadata(value)) {
			throw new Error(`Invalid attempt metadata in ${attemptRoot.fsPath}.`);
		}
		return value;
	}

	private getWorkspacesRoot(): vscode.Uri {
		return vscode.Uri.joinPath(this.storageRoot, 'learner-workspaces');
	}
}

interface AttemptWorkspaceMetadata {
	schemaVersion: 1;
	attemptId: string;
	challengeId: string;
	challengeVersion: string;
	entrypoint: string;
}

function isAttemptWorkspaceMetadata(value: unknown): value is AttemptWorkspaceMetadata {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const metadata = value as Record<string, unknown>;
	return metadata.schemaVersion === 1
		&& typeof metadata.attemptId === 'string'
		&& typeof metadata.challengeId === 'string'
		&& typeof metadata.challengeVersion === 'string'
		&& typeof metadata.entrypoint === 'string';
}

function normalizeRelativePath(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new Error(`Invalid ${label} path.`);
	}
	const normalized = path.posix.normalize(value);
	if (
		path.posix.isAbsolute(normalized)
		|| normalized === '..'
		|| normalized.startsWith('../')
	) {
		throw new Error(`Unsafe ${label} path: ${value}`);
	}
	return normalized;
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
