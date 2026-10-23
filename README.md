# CodeArc

CodeArc is an interactive software engineering challenge platform.

Run the commands below from the repository root unless stated otherwise.

## Repository structure

- `extension/` — VS Code extension
- `backend/` — Flask API and progression services
- `challenges/` — versioned challenge definitions, tests, and starter projects
- `shared/` — shared schemas and TypeScript contracts

## Backend

Create the virtual environment and install dependencies:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
```

Run the development server:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m flask --app app run --debug
```

Run all backend tests:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests
```

Validate every challenge manifest against the shared JSON Schema and check its referenced files:

```sh
npm run validate:challenges
```

Python linting and static type checking are not configured yet. Add the chosen tools to the backend dependencies before adding commands for them here.

## VS Code extension

Install the npm workspace dependencies from the repository root:

```sh
npm install
```

Run the extension tests:

```sh
npm --prefix extension test
```

Run linting:

```sh
npm --prefix extension run lint
```

Run TypeScript type checking:

```sh
npm --prefix extension run check-types
```

Build the extension, including linting and type checking:

```sh
npm --prefix extension run compile
```

Open `extension/` in VS Code and press `F5` to launch the Extension Development Host.
