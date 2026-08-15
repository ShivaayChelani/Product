# Contributing to PalSafar

Thank you for considering contributing to PalSafar. Please follow these guidelines to keep the project maintainable and secure.

## Branch Naming

Use descriptive branch names with a prefix:

- `feature/description` — New features (e.g., `feature/vendor-analytics`)
- `fix/description` — Bug fixes (e.g., `fix/place-search-race-condition`)
- `chore/description` — Maintenance (e.g., `chore/update-dependencies`)
- `docs/description` — Documentation (e.g., `docs/api-usage`)
- `refactor/description` — Code refactoring (e.g., `refactor/place-service`)

## Commit Style

Use conventional commits:

```
type(scope): description

[optional body]
```

**Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `style`, `perf`

**Examples:**
- `feat(places): add geospatial search endpoint`
- `fix(auth): resolve JWT refresh token race condition`
- `docs(api): document monetization endpoints`

## Pull Request Checklist

Before submitting a PR, verify:

- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Lint passes in all affected workspaces (`npm run lint`)
- [ ] No secrets, credentials, or `.env` files are included
- [ ] Changes are scoped to the relevant module or workspace
- [ ] New code follows existing patterns and conventions
- [ ] No unnecessary files are committed (build artifacts, logs, etc.)
- [ ] API changes include validation (Zod schemas)
- [ ] Database changes include Prisma migrations

## Code Standards

### General

- TypeScript strict mode enabled
- No `any` types — use proper type definitions
- Follow existing naming conventions (camelCase for variables, PascalCase for types)
- Use async/await over raw promises
- Handle errors with try/catch and the shared `ApiError` utility

### Server

- All modules follow the controller → routes → service → validation pattern
- Use Zod schemas for request validation
- Use Prisma for all database access
- Write integration tests for new endpoints
- Use the shared logger for all logging

### Mobile App

- Use the shared API client in `src/services/api/`
- Follow the existing component structure
- Use React Navigation for routing
- Use TypeScript for all new files

### Admin Dashboard

- Follow Next.js 14 App Router conventions
- Use server components where possible
- Use the shared API service layer

## Code Review

All PRs require at least one review before merging. Reviewers should check for:

- Correctness and edge cases
- Security implications
- Performance considerations
- Code style and consistency
- Test coverage

## Need Help?

Open a discussion or issue for questions about the contribution process.
