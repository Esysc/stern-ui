#!/usr/bin/env bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHANGELOG_FILE="$REPO_ROOT/CHANGELOG.md"

# CLI arguments
VERSION_TYPE=""
AUTO_CONFIRM=false
USE_CURRENT_VERSION=false
FORCE_RERELEASE=false

# Functions
info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."

    if ! command -v git &> /dev/null; then
        error "git is not installed"
    fi

    if ! command -v gh &> /dev/null; then
        error "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/"
    fi

    if ! gh auth status &> /dev/null; then
        error "GitHub CLI is not authenticated. Run: gh auth login"
    fi

    if [ ! -f "$CHANGELOG_FILE" ]; then
        error "CHANGELOG.md not found at $CHANGELOG_FILE"
    fi

    # Check if we're in a git repo
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        error "Not in a git repository"
    fi

    # Check for uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        error "You have uncommitted changes. Please commit or stash them first."
    fi

    # Check if we're on main/master branch
    current_branch=$(git branch --show-current)
    if [[ "$current_branch" != "main" && "$current_branch" != "master" ]]; then
        warning "You are not on main/master branch. Current branch: $current_branch"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    success "All prerequisites met"
}

# Show usage
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [VERSION_TYPE]

Automate the release process: version bumping, tagging, and GitHub release creation.

ARGUMENTS:
    VERSION_TYPE    Version bump type: patch, minor, or major
                    If not provided, will prompt interactively
                    Not required when using --current

OPTIONS:
    -c, --current   Use current version from CHANGELOG (no version bump)
                    Useful for first release or re-releasing
    -f, --force     Force re-release: delete existing tag and GitHub release
                    Useful for fixing mistakes or updating a release
    -y, --yes       Auto-confirm all prompts (non-interactive mode)
    -h, --help      Show this help message

EXAMPLES:
    # Interactive mode (prompts for version type)
    $(basename "$0")

    # First release - use current version 0.1.0 from CHANGELOG
    $(basename "$0") --current

    # Patch release (0.1.0 -> 0.1.1)
    $(basename "$0") patch

    # Minor release with auto-confirm (0.1.0 -> 0.2.0)
    $(basename "$0") minor --yes

    # Major release (0.1.0 -> 1.0.0)
    $(basename "$0") major -y

EOF
    exit 0
}

# Parse CLI arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                ;;
            -y|--yes)
                AUTO_CONFIRM=true
                shift
                ;;
            -c|--current)
                USE_CURRENT_VERSION=true
                shift
                ;;
            -f|--force)
                FORCE_RERELEASE=true
                shift
                ;;
            patch|minor|major)
                if [ -n "$VERSION_TYPE" ]; then
                    error "Multiple version types specified. Use only one: patch, minor, or major"
                fi
                VERSION_TYPE="$1"
                shift
                ;;
            *)
                error "Unknown argument: $1. Use --help for usage information."
                ;;
        esac
    done

    # Validate flags combination
    if [ "$USE_CURRENT_VERSION" = true ] && [ -n "$VERSION_TYPE" ]; then
        error "Cannot specify both --current and a version type (patch/minor/major)"
    fi

    # Validate version type if provided
    if [ -n "$VERSION_TYPE" ] && [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
        error "Invalid version type: $VERSION_TYPE. Use patch, minor, or major"
    fi
}

# Parse current version from CHANGELOG
get_current_version() {
    # Extract the first version tag from CHANGELOG (format: ## [X.Y.Z])
    local version=$(grep -m 1 -oP '##\s+\[\K[0-9]+\.[0-9]+\.[0-9]+(?=\])' "$CHANGELOG_FILE" || echo "")

    if [ -z "$version" ]; then
        error "Could not parse current version from CHANGELOG.md"
    fi

    echo "$version"
}

# Increment version
increment_version() {
    local version=$1
    local type=$2

    IFS='.' read -r major minor patch <<< "$version"

    case $type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            error "Invalid version type: $type. Use major, minor, or patch"
            ;;
    esac

    echo "$major.$minor.$patch"
}

# Prompt for version bump type
prompt_version_bump() {
    echo ""
    echo "Select version bump type:"
    echo "  1) patch   - Bug fixes, minor changes (0.1.0 -> 0.1.1)"
    echo "  2) minor   - New features, backwards compatible (0.1.0 -> 0.2.0)"
    echo "  3) major   - Breaking changes (0.1.0 -> 1.0.0)"
    echo ""

    while true; do
        read -p "Enter choice (1-3): " choice
        case $choice in
            1) echo "patch"; return ;;
            2) echo "minor"; return ;;
            3) echo "major"; return ;;
            *) echo "Invalid choice. Please enter 1, 2, or 3." ;;
        esac
    done
}

# Extract commits since last release and categorize them
extract_commits_since_last_release() {
    local last_version=$1
    local last_tag="v$last_version"

    # Check if tag exists, if not get all commits
    if git rev-parse "$last_tag" >/dev/null 2>&1; then
        # Exclude release preparation commits
        git log "$last_tag..HEAD" --pretty=format:"%s" --no-merges | grep -v "^chore: prepare release"
    else
        # First release - get all commits, excluding release prep
        git log --pretty=format:"%s" --no-merges | grep -v "^chore: prepare release"
    fi
}

# Generate changelog content from commits
generate_changelog_content() {
    local last_version=$1
    local added=()
    local changed=()
    local fixed=()

    # Extract commits
    while IFS= read -r commit; do
        # Categorize based on conventional commit prefixes
        if [[ $commit =~ ^feat:.*$ ]] || [[ $commit =~ ^feature:.*$ ]]; then
            # Remove prefix and add to Added section
            msg=$(echo "$commit" | sed -E 's/^(feat|feature):\s*//')
            added+=("$msg")
        elif [[ $commit =~ ^fix:.*$ ]]; then
            # Remove prefix and add to Fixed section
            msg=$(echo "$commit" | sed -E 's/^fix:\s*//')
            fixed+=("$msg")
        elif [[ $commit =~ ^(chore|refactor|perf|style|docs):.*$ ]]; then
            # Remove prefix and add to Changed section
            msg=$(echo "$commit" | sed -E 's/^[^:]+:\s*//')
            changed+=("$msg")
        else
            # Default to Changed if no conventional commit prefix
            changed+=("$commit")
        fi
    done < <(extract_commits_since_last_release "$last_version")

    # Generate output
    echo "### Added"
    echo ""
    if [ ${#added[@]} -gt 0 ]; then
        for item in "${added[@]}"; do
            echo "- $item"
        done
    fi
    echo ""
    echo "### Changed"
    echo ""
    if [ ${#changed[@]} -gt 0 ]; then
        for item in "${changed[@]}"; do
            echo "- $item"
        done
    fi
    echo ""
    echo "### Fixed"
    echo ""
    if [ ${#fixed[@]} -gt 0 ]; then
        for item in "${fixed[@]}"; do
            echo "- $item"
        done
    fi
}

# Update CHANGELOG with new version
update_changelog() {
    local new_version=$1
    local old_version=$2
    local date=$(date +%Y-%m-%d)
    local temp_file=$(mktemp)
    local temp_content=$(mktemp)

    info "Generating changelog content from commits..."

    # Generate changelog content from commits
    generate_changelog_content "$old_version" > "$temp_content"

    info "Updating CHANGELOG.md..."

    # Replace [Unreleased] with generated content and the new version
    awk -v new_version="$new_version" -v date="$date" -v content_file="$temp_content" '
    BEGIN {
        unreleased_replaced = 0
        # Read the generated content
        while ((getline line < content_file) > 0) {
            content = content line "\n"
        }
        close(content_file)
    }

    # Replace the [Unreleased] section
    /^## \[Unreleased\]/ {
        if (!unreleased_replaced) {
            # Add new empty Unreleased section
            print "## [Unreleased]"
            print ""
            print "### Added"
            print ""
            print "### Changed"
            print ""
            print "### Fixed"
            print ""
            # Add the new version entry with generated content
            print "## [" new_version "] - " date
            print ""
            printf "%s", content
            unreleased_replaced = 1

            # Skip the old empty Unreleased sections
            in_unreleased = 1
            next
        }
    }

    # Skip lines until we hit the next version or non-empty content
    in_unreleased && /^### (Added|Changed|Fixed)/ { next }
    in_unreleased && /^$/ { next }
    in_unreleased && /^## \[[0-9]/ { in_unreleased = 0 }

    # Print all other lines
    { print }
    ' "$CHANGELOG_FILE" > "$temp_file"

    mv "$temp_file" "$CHANGELOG_FILE"
    rm "$temp_content"
    success "CHANGELOG.md updated with version $new_version"
}

# Extract release notes for the current version
extract_release_notes() {
    local version=$1
    local temp_file=$(mktemp)

    # Extract content between [version] and the next version or end
    awk -v version="$version" '
    BEGIN { in_version = 0; found = 0 }

    # Match version header
    $0 ~ "^## \\[" version "\\]" {
        in_version = 1
        found = 1
        next
    }

    # Stop at next version or at the link references
    /^## \[[0-9]/ && in_version { exit }
    /^\[[0-9]/ && in_version { exit }

    # Print lines within the version section
    in_version { print }

    END { if (!found) exit 1 }
    ' "$CHANGELOG_FILE" > "$temp_file"

    if [ $? -ne 0 ]; then
        error "Could not extract release notes for version $version"
    fi

    cat "$temp_file"
    rm "$temp_file"
}

# Delete existing tag and release
delete_existing_release() {
    local version=$1
    local tag="v$version"

    info "Checking for existing release $tag..."

    # Check if tag exists locally
    if git rev-parse "$tag" >/dev/null 2>&1; then
        warning "Tag $tag exists locally, deleting..."
        git tag -d "$tag"
        success "Local tag deleted"
    fi

    # Check if tag exists remotely
    if git ls-remote --tags origin | grep -q "refs/tags/$tag"; then
        warning "Tag $tag exists on remote, deleting..."
        git push origin ":refs/tags/$tag" 2>/dev/null || true
        success "Remote tag deleted"
    fi

    # Check if GitHub release exists
    if gh release view "$tag" >/dev/null 2>&1; then
        warning "GitHub release $tag exists, deleting..."
        gh release delete "$tag" --yes 2>/dev/null || true
        success "GitHub release deleted"
    fi

    success "Existing release cleaned up"
}

# Create git tag
create_tag() {
    local version=$1
    local tag="v$version"

    info "Creating git tag $tag..."

    # Check if tag already exists (should not happen if delete was called)
    if git rev-parse "$tag" >/dev/null 2>&1; then
        error "Tag $tag already exists"
    fi

    git tag -a "$tag" -m "Release $tag"
    success "Tag $tag created"
}

# Push changes and tag
push_to_remote() {
    local tag=$1

    info "Pushing changes to remote..."

    # Only commit changelog if it was modified
    if [ "$USE_CURRENT_VERSION" = false ]; then
        git add "$CHANGELOG_FILE"
        git commit -m "chore: prepare release $tag"
        git push origin "$(git branch --show-current)"
    fi

    info "Pushing tag $tag..."
    git push origin "$tag"

    success "Changes and tag pushed to remote"
}

# Create GitHub release
create_github_release() {
    local version=$1
    local tag="v$version"
    local temp_notes=$(mktemp)

    info "Creating GitHub release..."

    # Extract release notes
    extract_release_notes "$version" > "$temp_notes"

    # Create release using gh CLI
    gh release create "$tag" \
        --title "Release $tag" \
        --notes-file "$temp_notes" \
        --latest

    rm "$temp_notes"
    success "GitHub release created: $tag"
}

# Main flow
main() {
    # Parse CLI arguments
    parse_args "$@"

    echo ""
    echo "═══════════════════════════════════════"
    echo "  Stern UI Release Automation Script"
    echo "═══════════════════════════════════════"
    echo ""

    check_prerequisites

    current_version=$(get_current_version)
    info "Current version: $current_version"

    # Determine the version to release
    if [ "$USE_CURRENT_VERSION" = true ]; then
        new_version="$current_version"
        info "Using current version (no bump)"
    else
        # Prompt for version bump type if not provided via CLI
        if [ -z "$VERSION_TYPE" ]; then
            bump_type=$(prompt_version_bump)
        else
            bump_type="$VERSION_TYPE"
            info "Version bump type: $bump_type"
        fi

        new_version=$(increment_version "$current_version" "$bump_type")
    fi

    echo ""
    if [ "$new_version" = "$current_version" ]; then
        info "Releasing current version: $new_version"
    else
        info "New version will be: $new_version"
    fi
    echo ""

    # Confirm unless auto-confirm is enabled
    if [ "$AUTO_CONFIRM" = false ]; then
        read -p "Proceed with release $new_version? (y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            warning "Release cancelled"
            exit 0
        fi
    else
        info "Auto-confirm enabled, proceeding with release..."
    fi

    # Execute release steps
    echo ""
    info "Starting release process..."
    echo ""

    # Check if release exists and handle force flag
    local tag="v$new_version"
    if git rev-parse "$tag" >/dev/null 2>&1 || gh release view "$tag" >/dev/null 2>&1; then
        if [ "$FORCE_RERELEASE" = true ]; then
            warning "Release $tag already exists. Force flag enabled, will delete and recreate..."
            delete_existing_release "$new_version"
        else
            error "Release $tag already exists. Use --force to delete and recreate it."
        fi
    fi

    # Only update changelog if bumping version
    if [ "$USE_CURRENT_VERSION" = false ]; then
        update_changelog "$new_version" "$current_version"
    else
        info "Skipping CHANGELOG update (using current version)"
    fi

    create_tag "$new_version"
    push_to_remote "v$new_version"
    create_github_release "$new_version"

    echo ""
    success "═══════════════════════════════════════"
    success "  Release $new_version completed!"
    success "═══════════════════════════════════════"
    echo ""
    info "View release at: $(gh repo view --json url -q .url)/releases/tag/v$new_version"
    echo ""
}

# Run main function
main "$@"
