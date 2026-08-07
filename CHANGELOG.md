# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub Actions CI workflow that compiles and runs all tests (pre-commit, golangci-lint, backend and frontend tests) on push and pull requests
- Renovate configuration for automated dependency update PRs (frontend, Go, and Docker)

### Changed

- Docker image now runs as a non-root user (`stern`) instead of root
- Centralized developer tooling versions (Go, Node, golangci-lint) in a single `mise.toml`, consumed by CI via `jdx/mise-action` and auto-updated by Renovate
- Docker frontend build stage now uses Node 24 instead of the deprecated Node 20 base image
- CI now provisions all tool runtimes through mise instead of separate setup-node/setup-go/golangci-lint actions

### Fixed

- CI failing when eslint was not yet installed before the pre-commit checks ran
- golangci-lint failing to run because the pinned version was built with an older Go toolchain than the module targets

## [0.5.0] - 2026-08-06

### Added

- Cluster management: browse cluster events, node/pod health summary, and apply or delete YAML manifests
- Resource browser for configmaps, secrets, service accounts, RBAC roles/bindings, and workloads
- Resource detail view with full YAML shown on row click
- Event detail modal exposing source, count, namespace, and first-seen fields
- Multiple independent log streams, each with its own filters, cluster context, and auto-reconnect
- Combined pod/container selector for stream configuration
- Namespace filter in the events view populated from the selected cluster
- Animated demo GIF in the README

### Changed

- Simplified log stream configuration to a namespace + pod/container selector
- Removed unused advanced filtering options (exclude/include patterns, highlight, container state, time ranges, downloads)
- Cluster management endpoints accept the context as a query parameter, supporting context names containing slashes (e.g. EKS ARNs)
- Updated README and unit test workflow instructions

### Fixed

- Cluster management requests returning the SPA HTML fallback instead of JSON for context names containing slashes
- Unknown `/api/*` and `/ws/*` paths returning 200 HTML instead of a 404 JSON error
- `task run` failing on Windows because the built binary was named `stern-ui` instead of `stern-ui.exe`
- Running the backend binary with a `.\` prefix breaking under Git Bash on Windows

## [0.4.0] - 2026-03-30

### Added


### Changed

- preparing release
- address previous PR feedback
- add imrpovements and fix bugs

### Fixed

- parse timestamp from log message for untilTime filtering > > - Extract timestamp from log message field instead of non-existent timestamp field > - Timestamp format: [2026-01-15T14:44:37.663Z] at start of message > - Only send logs where timestamp <= untilTime > - Fixes issue where logs continued past specified end time
- resolve ESLint errors
- add keyboard shortcuts panel for connect, disconnect, pause, clear, and filter reset actions
- add active filter chips for quick visibility and one-click removal of applied filters
- add explicit connecting and connection error feedback in the log status area
- improve stream detach behavior to preserve active runtime configuration and connection state in detached windows
- improve toolbar and log viewer accessibility with clearer control labels, focus states, and responsive layout behavior
- improve download actions to work reliably with click and keyboard interactions instead of hover-only behavior
- improve log filtering workflow with a dedicated reset action and clearer empty-state guidance
- fix detached stream windows opening in a disconnected state after detaching an active stream
- fix popup-blocked detach attempts removing the source stream from the main window
- fix stream tab runtime PropTypes mismatches for numeric stream ids
- fix stale websocket error messages persisting after successful reconnect or manual disconnect
## [0.3.0] - 2026-01-08

### Added

- improve stream management with detach/reattach and persistent connections

### Changed


### Fixed

## [0.2.0] - 2026-01-08

### Added


### Changed

- prepare release v0.2.0

### Fixed

## [0.1.0] - 2026-01-07

### Added
- Initial release of Stern Web UI
- Real-time log streaming with WebSocket support
- Multi-stream support with tabbed interface
- Advanced filtering by namespace, selector, container, node, and regex patterns
- Automatic log level detection and color-coding (ERROR, WARN, INFO, DEBUG)
- Real-time search within logs with pattern highlighting
- Pause/Resume functionality with message buffering
- Download logs as JSON or plain text files
- Pod, namespace, and context autocomplete
- Persistent settings via localStorage
- Dark theme UI
- Taskfile.yml for build automation and task management
- Docker support with multi-stage builds
- Kubernetes deployment manifests (stern-ui.yaml)
- Comprehensive test suite for frontend and backend
- Frontend embedded into Go binary for single-binary deployment

### Tech Stack
- Backend: Go 1.25, Gin v1.11.0, Gorilla WebSocket v1.5.4
- Kubernetes: stern v1.33.1, client-go v0.35.0
- Frontend: React 19.2, Vite 7.2, TailwindCSS 4.1, Vitest 4.0
- Build: Task (Taskfile), Docker

### Dependencies
- Go 1.25+
- Node.js 20+
- kubectl with configured cluster access
- Docker (optional, for containerized deployment)
- Task (optional, for task automation)

[0.1.0]: https://github.com/yourusername/stern-ui/releases/tag/v0.1.0
