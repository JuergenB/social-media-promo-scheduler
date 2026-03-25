# Contributing to PolyWiz

Thank you for your interest in contributing to PolyWiz! This document provides guidelines and information for contributors.

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great together.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- A [Zernio API key](https://zernio.com/dashboard/api-keys) for testing

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/social-media-promo-scheduler.git
   cd social-media-promo-scheduler
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

5. Add your Zernio API key to `.env.local`

6. Start the development server:
   ```bash
   npm run dev
   ```

## Development Guidelines

### Code Style

- We use TypeScript for type safety
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Keep components small and focused

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```
feat: add drag-and-drop to calendar
fix: resolve timezone offset in scheduler
docs: update README with Docker instructions
```

### Pull Requests

1. Create a new branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes

3. Run linting and type checks:
   ```bash
   npm run lint
   npx tsc --noEmit
   ```

4. Push your branch and create a PR

5. Fill out the PR template with:
   - What the PR does
   - How to test it
   - Screenshots (for UI changes)

### Project Structure

```
src/
├── app/                    # Next.js App Router pages
├── components/
│   ├── ui/                 # shadcn/ui base components
│   ├── composer/           # Post composer components
│   ├── calendar/           # Calendar components
│   └── shared/             # Reusable components
├── lib/
│   └── late-api/           # Zernio API client and types
└── stores/                 # Zustand state stores
```

### Key Technologies

- **Next.js 14** - App Router, Server Components
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Headless UI components
- **TanStack Query** - Server state management
- **Zustand** - Client state management
- **Zernio SDK** - `@getlatedev/node` for API calls

### Adding New Features

1. **UI Components**: Add to `src/components/`, use shadcn/ui primitives
2. **API Integration**: Use the Zernio SDK via `src/lib/late-api/`
3. **State**: Use Zustand for client state, TanStack Query for server state
4. **Routes**: Add to `src/app/` following Next.js App Router conventions

## Reporting Issues

### Bug Reports

Include:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS information
- Screenshots if applicable

### Feature Requests

Include:
- Use case description
- Proposed solution (optional)
- Alternatives considered (optional)

## Questions?

- Open a [GitHub Discussion](https://github.com/zernio-dev/social-media-promo-scheduler/discussions)
- Join our [Discord](https://discord.gg/late)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
