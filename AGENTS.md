# CapFlow Team Working Agreement

This file defines how agents and maintainers should work in this repository.
Treat it as the project-level operating agreement for planning, editing,
testing, documenting, and committing changes.

## Core Principle

CapFlow is a financial application where data, calculations, analytics, and UI
are tightly connected. Work conservatively, keep changes scoped, and preserve
the integrity of user data and historical calculations.

Before making changes:

- Understand the affected user scenario.
- Identify the touched layers: route, component, selector, calculation engine,
  domain types, storage, tests, and documentation.
- Prefer the existing architecture and patterns over new abstractions.
- Do not change code when the user only asked for analysis.

## Task Scoping

Scope each task around one clear user scenario or one coherent technical layer.

Good task scopes:

- Fix tax calculation for deposits.
- Add or improve the key-rate settings screen.
- Improve the asset detail card.
- Change calendar behavior for payout events.
- Add tests for a calculation rule.

Avoid mixing unrelated work in one task. Do not combine UI redesign, calculation
changes, storage migrations, dependency changes, and documentation unless they
are all required for the same user-facing change.

For every implementation task:

- Read the relevant files before editing.
- Keep edits minimal and local to the request.
- Preserve unrelated user or generated changes in the working tree.
- Add or update focused tests when behavior, calculations, selectors, or storage
  contracts change.
- Run relevant checks before reporting completion.

If there are multiple equally good implementations, choose the one that is most
consistent with the existing codebase instead of introducing a new pattern.

## Commits

Create commits only when explicitly asked.

A commit should represent one complete logical unit:

- Code builds.
- Relevant tests pass, or any unrun checks are clearly reported.
- No accidental files are included.
- Documentation is updated when the change affects product or architecture
  decisions.

Good commit units:

- Add rate adjustment flow for assets.
- Fix capitalization calculation.
- Update tax analytics rules.
- Add bond model groundwork.

Avoid broad commits such as "many improvements" or "misc fixes".

Before staging or committing:

- Check the working tree.
- Separate unrelated changes.
- Do not stage `.claude/`, build outputs, caches, runtime artifacts, or other
  incidental files unless explicitly requested.
- Do not include changes made by someone else unless the user confirms they
  belong in the commit.

## Documentation

Update documentation when the product meaning, architecture, data model, or
calculation rules change.

Primary documentation targets:

- `CapFlow_Specification-5.md` for product behavior and UX rules.
- `CapFlow_Decisions.md` for accepted decisions and rationale.
- `README.md` for setup, usage, and project-level instructions.
- Local code comments only where a rule is subtle and would be easy to
  misunderstand.

Documentation should be updated for:

- New financial instrument behavior.
- Calculation rule changes.
- Tax logic changes.
- Asset lifecycle changes.
- Navigation or major UX pattern changes.
- Storage format, backup/import/export, or migrations.
- New assumptions that affect analytics, calendar, or historical data.

Do not update documentation for purely cosmetic UI tweaks unless they establish
a reusable design rule.

## When To Ask For Clarification

Ask before proceeding when the decision affects product meaning, user data, or
financial interpretation.

Ask for clarification when:

- The calculation rule is ambiguous.
- A change may require migration of saved data.
- The task could delete, archive, rename, or reinterpret user entities.
- Multiple UX options have meaningfully different consequences.
- The change affects taxes, financial results, historical records, or snapshots.
- There are unrelated changes in the same files and it is unclear how to merge
  with them.
- The user asks for a broad outcome but not the intended product behavior.

Do not stop for low-risk implementation details. Use the most conservative
choice that matches the existing codebase.

If an implementation alternative appears significantly better than the requested
solution, stop before making changes and explain:

- Why the alternative is better.
- Which files it will affect.
- The trade-offs.
- Whether it changes architecture.

Wait for explicit approval before choosing that alternative. Otherwise,
implement the requested solution exactly as requested.

## Never Without Explicit Permission

Never do any of the following without explicit user permission:

- Change code when the user requested only analysis.
- Run destructive git operations such as reset, checkout, restore, or revert of
  existing work.
- Delete files or user data.
- Commit, push, create a pull request, or publish a release.
- Install, remove, or upgrade dependencies.
- Change package versions.
- Rewrite large screens or refactor broad areas "while here".
- Reformat the whole project for a local task.
- Change storage schema, migrations, backup/import/export behavior, or saved
  data semantics without explaining the impact first.
- Modify tax or financial assumptions without confirming the intended rule.
- Include incidental files such as `.claude/`, caches, build outputs, generated
  runtime files, or local configuration in commits.

## Verification

Prefer these checks after code changes:

- `npm run typecheck`
- `npm test -- --runInBand`

Run narrower checks when a task is small and the affected area is clear. Run
broader checks when touching shared layers such as `src/calc`, `src/state`,
`src/storage`, domain types, or navigation.

If a check cannot be run, report that clearly.

Agents may execute local development commands without additional confirmation,
including:

- `git status` and other read-only git inspection commands.
- `npm` scripts that do not install or remove packages.
- `npx expo` local development commands.
- `adb` device/status/install/run commands.
- TypeScript checks, lint checks, and tests.

Ask for explicit confirmation before any command that:

- Deletes files or is otherwise destructive.
- Changes git history.
- Commits, stages, pushes, or creates pull requests.
- Installs, upgrades, removes, or changes packages.
- Modifies system configuration.

## Repository-Specific Notes

Important shared layers:

- `app/` contains Expo Router screens and navigation.
- `src/state/DataContext.tsx` owns app state, persistence orchestration, rates,
  demo data, and mutations.
- `src/state/selectors.ts` turns stored data into derived portfolio, analytics,
  calendar, and asset views.
- `src/calc/` contains financial calculation rules.
- `src/domain/` contains core product types and reference data.
- `src/storage/` contains persisted data shape and repository behavior.
- `src/components/` contains reusable UI building blocks.
- `src/theme/`, `src/format/`, and `src/i18n/` keep presentation rules
  consistent.

The intended data flow is:

1. User enters primary data in screens.
2. `DataContext` updates and persists `AppData`.
3. Selectors derive views and aggregates from `AppData`.
4. The calculation engine computes financial results.
5. UI components render formatted values from shared format/theme helpers.

Keep this flow intact. Do not store derived values unless they are explicitly
historical records, such as snapshots or tax-year records.
