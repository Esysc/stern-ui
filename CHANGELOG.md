# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- add keyboard shortcuts panel for connect, disconnect, pause, clear, and filter reset actions
- add active filter chips for quick visibility and one-click removal of applied filters
- add explicit connecting and connection error feedback in the log status area

### Changed

- improve stream detach behavior to preserve active runtime configuration and connection state in detached windows
- improve toolbar and log viewer accessibility with clearer control labels, focus states, and responsive layout behavior
- improve download actions to work reliably with click and keyboard interactions instead of hover-only behavior
- improve log filtering workflow with a dedicated reset action and clearer empty-state guidance

### Fixed

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
