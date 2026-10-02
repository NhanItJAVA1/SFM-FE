# SFM-FE Copilot Instructions

## Project

SFM-FE is the frontend/mobile application of the SFM (Smart Finance Management) system.

Technology:

- React Native
- Expo
- TypeScript
- Expo Router
- Axios

SFM consists of three separate projects:

- SFM-FE: React Native / Expo frontend
- SFM-BE: ASP.NET Core backend
- SFM-AI: Python AI/ML service

This repository is responsible for the frontend/mobile application.

## General Rules

1. Inspect existing code before making changes.
2. Follow the existing project structure and coding patterns.
3. Make the smallest change necessary.
4. Do not refactor unrelated code.
5. Reuse existing components, hooks, utilities, and API services.
6. Do not create duplicate API functions or components when existing implementations can be reused.
7. Do not invent backend endpoints, request fields, response fields, or business behavior.
8. Do not modify SFM-BE or SFM-AI from this repository.
9. Do not add dependencies unless necessary.
10. Keep code readable, maintainable, and consistent with the existing project.

## React Native / Expo

- Follow the existing Expo project configuration.
- Use Expo APIs when the project already uses them.
- Follow the existing Expo Router structure.
- Keep screens focused on UI and user interaction.
- Move reusable logic into hooks, utilities, or services when appropriate.
- Reuse existing components before creating new ones.
- Do not introduce another navigation system.
- Do not change Expo SDK configuration unless explicitly requested.

## TypeScript

- Use TypeScript types and interfaces consistently with the existing code.
- Avoid `any` unless there is a specific reason.
- Reuse existing domain types.
- Keep API request and response types synchronized with actual backend contracts.
- Do not silently cast incompatible types.
- Prefer explicit types for API data and important business logic.

## API Integration

The frontend communicates primarily with SFM-BE through HTTP APIs.

Follow the existing pattern:

UI
→ hook/service
→ API function
→ axiosClient
→ SFM-BE

Rules:

- Reuse the existing `axiosClient`.
- Reuse existing API modules.
- Do not call APIs directly from UI components when an existing API service pattern is available.
- Check the actual API implementation or Swagger contract before creating or modifying API calls.
- Match HTTP method, endpoint, request body, query parameters, and response structure exactly.
- Handle loading, success, and error states appropriately.
- Do not invent response fields.

## Authentication

Follow the existing authentication implementation.

Rules:

- Reuse existing authentication utilities and state.
- Do not create a second authentication mechanism.
- Keep tokens and credentials out of source code.
- Use environment variables for public configuration values where appropriate.
- Never hardcode secrets.
- Preserve the existing login/session flow unless explicitly requested to change it.

## Environment Variables

Use the project's existing Expo environment variable conventions.

Example:

EXPO*PUBLIC*\*

Rules:

- Never hardcode secrets.
- Do not expose private credentials through `EXPO_PUBLIC_*`.
- Check existing `.env` usage before introducing new variables.
- Do not modify environment configuration unnecessarily.

## UI / UX

When modifying UI:

- Follow the existing visual style.
- Reuse existing spacing, typography, colors, borders, and components.
- Preserve responsive behavior.
- Consider different screen sizes.
- Handle loading, empty, error, and success states where relevant.
- Do not redesign unrelated screens.

When a UI change is requested, modify only the affected screen/component unless broader changes are necessary.

## State and Data

Before introducing new state:

1. Check whether the required data already exists.
2. Check existing hooks or state management.
3. Reuse existing state when possible.
4. Avoid duplicating server data unnecessarily.

Keep server/API data separate from local UI state when the existing architecture does so.

## Notifications

Follow the existing `expo-notifications` implementation.

Rules:

- Reuse existing notification configuration and helpers.
- Do not create duplicate notification handlers.
- Check the existing notification flow before modifying it.
- Consider Android/iOS platform differences.
- Do not assume Expo Go supports every notification capability used by the project.

## Forms and Validation

- Follow existing form patterns.
- Validate user input before sending API requests when appropriate.
- Display useful validation errors.
- Do not duplicate validation rules unnecessarily.
- Keep validation consistent with backend expectations.

## Error Handling

When handling API errors:

- Preserve the existing error-handling pattern.
- Show user-friendly messages.
- Do not expose raw server errors unnecessarily.
- Handle network failures separately from validation/business errors when practical.
- Do not silently ignore errors.

## Debugging

When debugging:

1. Identify the exact error.
2. Locate the first point where the behavior becomes incorrect.
3. Trace the relevant UI → state/hook → API → backend flow.
4. Check actual request and response data.
5. Identify the root cause.
6. Apply the smallest safe fix.
7. Explain how to verify the fix.

Do not randomly change multiple files to hide an error.

## Testing and Verification

After modifying code:

- Check TypeScript errors.
- Check imports.
- Run the project's existing lint command when appropriate.
- Run relevant tests if they exist.
- Verify affected screens and user flows.
- Do not modify unrelated code simply to satisfy linting.

## Dependencies

Before installing a package:

1. Check whether the project already has a dependency that solves the problem.
2. Check the installed Expo SDK version.
3. Prefer Expo-compatible packages.
4. Avoid unnecessary dependencies.

Do not upgrade Expo or major dependencies unless explicitly requested.

## Code Modification Policy

Before editing:

- Identify relevant files.
- Understand the existing implementation.
- Check related API types and services.
- Reuse existing patterns.

After editing:

- Check imports and types.
- Check affected API calls.
- Check navigation if routes were changed.
- Check UI states.
- Keep the patch focused.

Prefer small, incremental changes over large refactors.

## Response Style

When helping with coding tasks:

- Be concise.
- Do not repeat the user's request.
- Mention relevant file paths and symbols.
- Explain the root cause before the fix when debugging.
- Show only necessary code.
- Do not dump entire files unless explicitly requested.
- Distinguish implemented behavior from suggestions.
- Do not invent backend behavior.

When multiple files are required, explain briefly why each file needs to change.
