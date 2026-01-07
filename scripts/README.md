# Release Scripts

## release.sh

Automated release script that handles versioning, changelog updates, git tagging, and GitHub releases.

### Recommended Usage (via Taskfile)

The easiest way to run releases is through the Taskfile:

```bash
# First release - use current version from CHANGELOG
task release -- --current --yes

# Interactive mode (prompts for version type)
task release

# Patch release (0.1.0 → 0.1.1)
task release -- patch

# Minor release (0.1.0 → 0.2.0)
task release -- minor

# Major release (0.1.0 → 1.0.0)
task release -- major

# Auto-confirm (non-interactive)
task release -- patch --yes
```

### Direct Script Usage (Alternative)

If you prefer to run the script directly without Task:

```bash
./scripts/release.sh [OPTIONS] [VERSION_TYPE]
```

**Options:**
- `--current, -c` - Use current version from CHANGELOG (no version bump)
- `--yes, -y` - Auto-confirm all prompts
- `--help, -h` - Show help message

**Version Types:**
- `patch` - Bug fixes, minor changes (0.1.0 → 0.1.1)
- `minor` - New features, backwards compatible (0.1.0 → 0.2.0)
- `major` - Breaking changes (0.1.0 → 1.0.0)

### Prerequisites

1. **GitHub CLI (gh)** - Install from [cli.github.com](https://cli.github.com/)
   ```bash
   # macOS
   brew install gh

   # Linux
   curl -sS https://webi.sh/gh | sh
   ```

2. **Authenticate with GitHub**
   ```bash
   gh auth login
   ```

3. **Clean working directory** - Commit or stash all changes before running

### How It Works

The script automatically:
1. Checks prerequisites (git, gh CLI, clean working directory)
2. Parses the current version from CHANGELOG.md
3. Determines version to release (bump or use current)
4. Updates CHANGELOG.md with new Unreleased section (if bumping)
5. Creates and pushes git tag
6. Commits changelog changes
7. Creates GitHub release with extracted release notes

### Example Output

**First Release (using current version from CHANGELOG):**
```bash
$ task release -- --current --yes

═══════════════════════════════════════
  Stern UI Release Automation Script
═══════════════════════════════════════

ℹ Checking prerequisites...
✓ All prerequisites met
ℹ Current version: 0.1.0
ℹ Using current version (no bump)

ℹ Releasing current version: 0.1.0

ℹ Auto-confirm enabled, proceeding with release...

ℹ Starting release process...
ℹ Skipping CHANGELOG update (using current version)
ℹ Creating git tag v0.1.0...
✓ Tag v0.1.0 created
ℹ Pushing tag v0.1.0...
✓ Tag pushed to remote
✓ GitHub release created: v0.1.0

✓ Release 0.1.0 completed!
```

**Subsequent Releases (version bump):**
```bash
$ task release -- minor

═══════════════════════════════════════
  Stern UI Release Automation Script
═══════════════════════════════════════

ℹ Checking prerequisites...
✓ All prerequisites met
ℹ Current version: 0.1.0
ℹ Version bump type: minor

ℹ New version will be: 0.2.0

Proceed with release 0.2.0? (y/N) y

ℹ Starting release process...

ℹ Updating CHANGELOG.md...
✓ CHANGELOG.md updated
ℹ Creating git tag v0.2.0...
✓ Tag v0.2.0 created
ℹ Pushing changes to remote...
✓ Changes and tag pushed to remote
✓ GitHub release created: v0.2.0

✓ Release 0.2.0 completed!
```

### Release Workflow

1. Make your changes and test thoroughly
2. Commit all changes:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. Run the release:
   ```bash
   task release -- minor
   ```

The script will automatically create an [Unreleased] section in the CHANGELOG for the next release.

### Troubleshooting

**Error: "GitHub CLI is not authenticated"**
```bash
gh auth login
```

**Error: "You have uncommitted changes"**
```bash
git status
git add .
git commit -m "your message"
```

**Error: "Not on main/master branch"**

The script warns if you're not on main/master but allows you to continue. Switch to main:
```bash
git checkout main
```

**Error: "Task not found"**

Install Task from [taskfile.dev](https://taskfile.dev/installation/):
```bash
# macOS
brew install go-task

# Linux
sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b ~/.local/bin
```
