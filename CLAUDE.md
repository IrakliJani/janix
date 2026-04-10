Shared repo guidance for agent behavior lives in [`README.md#agent-guidance`](./README.md#agent-guidance).

After adding or modifying code, run:

```bash
npm run check && npm run build
```

`check` runs format, lint, and typecheck.

## Release / publish policy

- Never publish a new version unless the user explicitly asks in the current chat.
- When bumping a version, always create and push a git tag.

### Standard release flow

1. Ensure working tree is clean and all changes are committed.
2. Bump version with npm (this creates a commit + tag), e.g.:
   - patch: `npm version patch`
   - minor: `npm version minor`
   - major: `npm version major`
3. Push commit and tags: `git push && git push --tags`
4. Publish to npm: `npm publish`
