# Build frontend
FROM node:24-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build backend with embedded frontend
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY --from=frontend-builder /app/dist ./frontend/dist
RUN go build -o stern-ui main.go

# Final stage - single binary with embedded frontend
FROM alpine:3.19
RUN apk add --no-cache kubectl ca-certificates && \
    addgroup -g 1000 stern && \
    adduser -D -u 1000 -G stern stern

WORKDIR /app
COPY --from=backend-builder /app/stern-ui /usr/local/bin/
RUN chown stern:stern /usr/local/bin/stern-ui

USER stern

EXPOSE 8080
CMD ["stern-ui"]
