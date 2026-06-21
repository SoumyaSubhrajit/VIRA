# Contributing to VIRA

First off, thank you for considering contributing to VIRA!

## Development Process

1. **Branching Strategy:** We use the feature branch workflow. Create a new branch for each feature or bugfix you are working on.
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Commit Messages:** We follow Conventional Commits (e.g., `feat: add new panel`, `fix: correct typo in header`).
3. **Pull Requests:** Before opening a PR, ensure that:
   - Your code passes all linting rules.
   - Any new functionality includes tests or manual verification steps.
   - You fill out the PR template completely.

## Code Style

- For the `operator` (Next.js) project, we use `ESLint` and `Prettier`. 
- Please run `npm run lint` and `npm run build` locally in the `operator` directory before submitting code.

## Issues

If you find a bug or have a feature request, please use the templates provided in the Issue Tracker.
