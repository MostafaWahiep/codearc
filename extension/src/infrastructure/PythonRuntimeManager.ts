import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	executeProcess,
	type ProcessExecutor,
	type ProcessResult,
} from './ProcessExecutor';

export interface PythonRuntime {
	ensureReady(cwd: string): Promise<string>;
}

export interface PythonRuntimeConfig {
	rootPath: string;
	requirementsPath: string;
}

export class PythonRuntimeManager implements PythonRuntime {
	private readonly requirementsMarkerName = '.requirements.sha256';

	public constructor(
		private readonly config: PythonRuntimeConfig,
		private readonly execute: ProcessExecutor = executeProcess,
		private readonly provisionTimeoutMilliseconds = 120_000,
	) {}

	public async ensureReady(cwd: string): Promise<string> {
		await fs.mkdir(this.config.rootPath, { recursive: true });
		const virtualEnvironmentPath = path.join(this.config.rootPath, '.venv');
		const runtimePython = pythonInVirtualEnvironment(virtualEnvironmentPath);
		let createdEnvironment = false;

		if (!await this.commandSucceeds(runtimePython, ['--version'], cwd)) {
			const systemPython = await this.findSystemPython(cwd);
			const createResult = await this.execute(
				systemPython,
				['-m', 'venv', virtualEnvironmentPath],
				{
					cwd,
					timeoutMilliseconds: this.provisionTimeoutMilliseconds,
				},
			);
			if (createResult.exitCode !== 0 || createResult.timedOut) {
				throw new Error(
					`CodeArc could not create its shared Python environment.${processFailureDetails(createResult)}`,
				);
			}
			createdEnvironment = true;
		}

		const requirementsHash = await hashFile(this.config.requirementsPath);
		const markerPath = path.join(
			this.config.rootPath,
			this.requirementsMarkerName,
		);
		const installedRequirementsHash = await fs.readFile(markerPath, 'utf8')
			.then((value) => value.trim())
			.catch(() => undefined);

		if (createdEnvironment || installedRequirementsHash !== requirementsHash) {
			const installResult = await this.execute(
				runtimePython,
				[
					'-m',
					'pip',
					'install',
					'--disable-pip-version-check',
					'-r',
					this.config.requirementsPath,
				],
				{
					cwd,
					timeoutMilliseconds: this.provisionTimeoutMilliseconds,
				},
			);
			if (installResult.exitCode !== 0 || installResult.timedOut) {
				throw new Error(
					`CodeArc could not install its Python test dependencies.${processFailureDetails(installResult)}`,
				);
			}
			await fs.writeFile(markerPath, `${requirementsHash}\n`, 'utf8');
		}

		return runtimePython;
	}

	private async findSystemPython(cwd: string): Promise<string> {
		for (const command of ['python3', 'python']) {
			if (await this.commandSucceeds(command, ['--version'], cwd)) {
				return command;
			}
		}
		throw new Error(
			'Python was not found. Install Python 3 and make `python3` available in PATH.',
		);
	}

	private async commandSucceeds(
		command: string,
		args: string[],
		cwd: string,
	): Promise<boolean> {
		try {
			const result = await this.execute(command, args, {
				cwd,
				timeoutMilliseconds: 5_000,
			});
			return result.exitCode === 0 && !result.timedOut;
		} catch {
			return false;
		}
	}
}

function pythonInVirtualEnvironment(virtualEnvironmentPath: string): string {
	return process.platform === 'win32'
		? path.join(virtualEnvironmentPath, 'Scripts', 'python.exe')
		: path.join(virtualEnvironmentPath, 'bin', 'python');
}

async function hashFile(filePath: string): Promise<string> {
	const content = await fs.readFile(filePath);
	return createHash('sha256').update(content).digest('hex');
}

function processFailureDetails(result: ProcessResult): string {
	const output = result.stderr.trim() || result.stdout.trim();
	if (result.timedOut) {
		return ' Setup timed out.';
	}
	return output ? ` ${output}` : '';
}
