# Build stage — compile the Rust binary
FROM rust:1.82-slim-bookworm AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
COPY migrations ./migrations

# build in release mode
RUN cargo build --release

# Runtime stage — minimal image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

RUN groupadd -r conduit && useradd -r -g conduit conduit

WORKDIR /app
COPY --from=builder /app/target/release/conduit /app/conduit
COPY --from=builder /app/migrations /app/migrations

USER conduit

EXPOSE 8080

CMD ["/app/conduit"]
