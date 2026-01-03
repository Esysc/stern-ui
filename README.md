# Stern Web UI

A modern web interface for [stern](https://github.com/stern/stern), the multi-pod and container log tailing tool for Kubernetes.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Go](https://img.shields.io/badge/Go-1.23-00ADD8.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)

## Features

- **Real-time Log Streaming** - WebSocket-based live log tailing from multiple pods
- **Multi-Stream Support** - Open multiple log streams in tabs simultaneously
- **Advanced Filtering** - Filter by namespace, selector, container, node, and regex patterns
- **Log Level Detection** - Automatic detection and color-coding of log levels (ERROR, WARN, INFO, DEBUG)
- **Search & Highlight** - Real-time search within logs with pattern highlighting
- **Pause/Resume** - Pause log streaming without losing incoming messages (buffered)
- **Download Logs** - Export logs as JSON or plain text files
- **Pod Autocomplete** - Smart autocomplete for namespaces, pods, and contexts
- **Persistent Settings** - Save your configuration to localStorage
- **Dark Theme** - Easy on the eyes for extended log watching sessions

## Screenshots

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🚀 Stern Web UI                                            Stream 1   [+]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Namespace: [default    ▼]   Query: [.*           ]   Since: [1h      ]    │
│  Selector:  [app=nginx   ]   Container: [         ]   Context: [      ▼]   │
│  ☑ Timestamps  ☐ All Namespaces  ☑ Init Containers                         │
│                                                    [Connect] [Clear] [⬇]   │
├─────────────────────────────────────────────────────────────────────────────┤
│  [12:34:56] nginx-7d9b8c / nginx    Starting nginx server...               │
│  [12:34:57] nginx-7d9b8c / nginx    Listening on port 80                   │
│  [12:34:58] api-5f6a7b   / api      ERROR: Connection refused              │
│  [12:34:59] nginx-7d9b8c / nginx    GET /health 200 OK                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- [Go 1.23+](https://golang.org/dl/)
- [Node.js 20+](https://nodejs.org/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configured with cluster access

> **Note**: Stern is included as a Go module dependency and does not need to be installed separately.

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/stern-ui.git
   cd stern-ui
   ```

2. **Build and run the frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Run the backend** (in another terminal)
   ```bash
   go run main.go
   ```

4. **Open your browser** at `http://localhost:5173` (Vite dev server proxies to backend)

### Production Build

The frontend is **embedded into the Go binary** for easy deployment as a single executable.

```bash
# Build frontend
cd frontend
npm ci
npm run build
cd ..

# Build backend (frontend gets embedded automatically via go:embed)
go build -o stern-ui main.go

# Run the single binary - no external files needed!
./stern-ui
# Open http://localhost:8080
```

**Note**: The frontend must be built before building the Go binary, as the `go:embed` directive includes the `frontend/dist` directory at compile time.

## Docker

### Build the Image

```bash
docker build -t stern-ui:latest .
```

### Run Locally with Docker

```bash
docker run -p 8080:8080 \
  -v ~/.kube/config:/root/.kube/config:ro \
  stern-ui:latest
```

## Kubernetes Deployment

Deploy stern-ui directly into your cluster:

```bash
# Apply the Kubernetes manifests
kubectl apply -f stern-ui.yaml

# Port-forward to access the UI
kubectl port-forward svc/stern-ui 8080:80

# Open http://localhost:8080
```

The included `stern-ui.yaml` creates:
- ServiceAccount with pod/log read permissions
- ClusterRole and ClusterRoleBinding for RBAC
- Deployment with resource limits
- ClusterIP Service

## Configuration Options

### Stern Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| **Namespace** | Kubernetes namespace to tail logs from | - |
| **Query** | Pod name regex pattern | `.` (all pods) |
| **Selector** | Label selector (e.g., `app=nginx`) | - |
| **Since** | Time duration for log history | `1h` |
| **Container** | Container name regex | - |
| **Exclude Container** | Exclude containers matching pattern | - |
| **Exclude Pod** | Exclude pods matching pattern | - |
| **Container State** | Filter by state: running, waiting, terminated | `all` |
| **Include** | Show only lines matching pattern | - |
| **Exclude** | Hide lines matching pattern | - |
| **Highlight** | Highlight text matching pattern | - |
| **Tail** | Number of initial lines | `-1` (all) |
| **Node** | Filter by node name | - |
| **Context** | Kubernetes context to use | current |
| **Max Log Requests** | Max concurrent log requests | `50` |

### Checkboxes

| Option | Description |
|--------|-------------|
| **All Namespaces** | Tail from all namespaces |
| **Timestamps** | Include timestamps in output |
| **Init Containers** | Include init container logs |
| **Ephemeral Containers** | Include ephemeral container logs |
| **No Follow** | Don't follow, exit after showing existing logs |

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│                 │◄──────────────────►│                 │
│   React UI      │                    │   Go Backend    │
│   (Vite/Tailwind)                    │   (Gin)         │
│                 │     REST API       │                 │
│                 │◄──────────────────►│                 │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ exec
                                                ▼
                                       ┌─────────────────┐
                                       │     stern       │
                                       │   CLI tool      │
                                       └────────┬────────┘
                                                │
                                                │ kubectl
                                                ▼
                                       ┌─────────────────┐
                                       │   Kubernetes    │
                                       │    Cluster      │
                                       └─────────────────┘
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ws/logs` | WebSocket | Stream logs with query parameters |
| `/api/namespaces` | GET | List available namespaces |
| `/api/pods` | GET | List pods (supports `?namespace=` and `?context=`) |
| `/api/contexts` | GET | List available kubectl contexts |
| `/api/nodes` | GET | List cluster nodes |

## Project Structure

```
stern-ui/
├── main.go                 # Go backend server
├── main_test.go            # Backend tests
├── Dockerfile              # Multi-stage Docker build
├── stern-ui.yaml           # Kubernetes manifests
├── go.mod                  # Go dependencies
└── frontend/
    ├── src/
    │   ├── App.jsx         # Main application component
    │   ├── constants/      # Configuration constants
    │   ├── utils/          # Helper functions
    │   ├── hooks/          # Custom React hooks
    │   └── components/
    │       ├── common/     # Reusable form components
    │       ├── logs/       # Log display components
    │       ├── stream/     # Stream management components
    │       └── layout/     # Layout components
    ├── package.json
    ├── vite.config.js
    └── tailwind.config.js
```

## Development

### Running Tests

```bash
# Frontend tests (102 tests)
cd frontend
npm test

# Backend tests
go test -v ./...
```

### Linting

```bash
# Frontend
cd frontend
npm run lint

# Backend
go vet ./...
golangci-lint run
```

### Pre-commit Hooks

This project uses pre-commit hooks for code quality:

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run on all files
pre-commit run --all-files
```

Hooks include:
- Trailing whitespace removal
- YAML/JSON validation
- Go fmt, vet, and golangci-lint
- ESLint for JavaScript/JSX

## Tech Stack

### Backend
- **Go 1.23** - Backend language
- **Gin** - HTTP web framework
- **Gorilla WebSocket** - WebSocket support
- **stern** - Kubernetes log tailing (CLI)

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **TailwindCSS 4** - Utility-first CSS
- **Vitest** - Test runner
- **Testing Library** - React testing utilities

## Troubleshooting

### stern not found

Ensure stern is installed and in your PATH:
```bash
stern --version
```

Install stern:
```bash
# macOS
brew install stern

# Linux
wget https://github.com/stern/stern/releases/latest/download/stern_linux_amd64.tar.gz
tar -xzf stern_linux_amd64.tar.gz
sudo mv stern /usr/local/bin/
```

### No logs appearing

1. Check kubectl is configured: `kubectl get pods`
2. Verify stern works directly: `stern . -n default`
3. Check browser console for WebSocket errors
4. Ensure the namespace has running pods

### Connection refused

The backend runs on port 8080 by default. Ensure:
- No other service is using port 8080
- Firewall allows the connection
- When using Docker, port is properly mapped

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run tests: `npm test && go test ./...`
5. Commit with pre-commit hooks: `git commit -m "feat: add my feature"`
6. Push and create a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [stern](https://github.com/stern/stern) - The excellent log tailing tool this UI wraps
- [Gin](https://github.com/gin-gonic/gin) - Fast Go web framework
- [Vite](https://vitejs.dev/) - Next generation frontend tooling
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework
