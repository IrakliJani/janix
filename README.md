# janix

Janix creates isolated Docker dev environments per git branch. Each branch gets its own git clone, Docker container, and Nix-based environment — so you can work on multiple branches simultaneously without conflicts.

Each container mounts your Claude config, so Claude Code works inside environments out of the box.

**How it works:**

- `init` configures the project: detects package manager, collects `.env` files, template variables, init/teardown scripts, and optional Docker network
- `create` clones the repo for the branch, builds a Docker image from `flake.nix`, and starts a container with persistent cache volumes
- `attach` drops you into an interactive shell inside the container via `nix develop`
- Package manager and Nix caches are persisted across environment recreations via Docker volumes
- `flake.nix` changes are detected automatically and trigger an image rebuild offer

## Usage

```bash
janix init               # Initialize janix in current repo
janix create [branch]    # Create dev environment for a branch
janix list               # List environments and their status
janix attach [branch]    # Attach to a running environment
janix stop [branch]      # Stop a container (preserves clone)
janix start [branch]     # Start a stopped container
janix destroy [branch]   # Remove container and clone
```

## Development

```bash
npm run check && npm run build
```
