export class BackendConnectionError extends Error {
	public constructor(
		public readonly backendUrl: string,
		cause: unknown,
	) {
		super(
			`Could not connect to the CodeArc server at ${backendUrl}. `
				+ 'Make sure the backend is running, then try again.',
			{ cause },
		);
		this.name = 'BackendConnectionError';
	}
}

export class BackendResponseError extends Error {
	public constructor(
		public readonly status: number,
		public readonly method: string,
		public readonly path: string,
		message: string,
	) {
		super(message);
		this.name = 'BackendResponseError';
	}
}

export class InvalidBackendResponseError extends Error {
	public constructor(
		public readonly method: string,
		public readonly path: string,
		details: string,
		options?: ErrorOptions,
	) {
		super(
			`The CodeArc server returned an invalid response for ${method} ${path}: ${details}`,
			options,
		);
		this.name = 'InvalidBackendResponseError';
	}
}
