# jaegent

Docker dev environments for git branches with Claude Code support.

## Development

Run in order:

```bash
npm run format       # oxfmt
npm run lint         # oxlint
npm run typecheck    # tsc --noEmit
npm run build        # tsc
npm run docker:build # build container image
```

Or all at once:

```bash
npm run check && npm run build && npm run docker:build
```

## Usage

```bash
npm start -- create [project] [branch]  # Create dev environment
npm start -- list                       # List environments
npm start -- attach <container>         # Attach to container
npm start -- stop <container>           # Stop container
npm start -- destroy [container]        # Destroy container
```
