# Things Bridge

Access your [Things 3](https://culturedcode.com/things/) "Today" list from any browser on your network.

Things Bridge is a lightweight server that runs on your Mac and exposes your Today tasks as a web app. View tasks, check them off, edit notes, and add new ones — from your Windows PC, tablet, or any device with a browser.

![Things Bridge Web UI](https://via.placeholder.com/600x400?text=Screenshot+Coming+Soon)

## Features

- View your Things 3 Today list in a clean, Things-inspired web UI
- Complete tasks with a checkbox
- Edit notes inline
- Add new tasks
- Auto-refreshes every 60 seconds
- Token-based authentication
- No build step — vanilla HTML/CSS/JS frontend

## How It Works

Things Bridge uses a hybrid approach:

- **Reads** use [`things.py`](https://github.com/thingsapi/things.py), a Python library that reads the Things 3 SQLite database directly, providing task UUIDs, titles, notes, and status.
- **Writes** (complete, update, create) use the [Things URL scheme](https://culturedcode.com/things/support/articles/2803573/) (`things:///update`, `things:///add`) to send commands to Things 3.
- **Serving** is handled by [FastAPI](https://fastapi.tiangolo.com/) — a single process serves both the REST API and the static web UI on port 8787.

## Prerequisites

- **macOS** — the server must run on your Mac (uses the `open` command and Things 3 URL scheme)
- **Things 3** installed and running
- **Python 3.10+** (tested with 3.14)
- **Things URL scheme enabled** — open Things 3, go to **Settings > General > Enable Things URLs**

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/cheyne75/things-bridge.git
cd things-bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure

Create a `.env` file in the project root:

```bash
# Generate a random API token for the bridge
THINGS_TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Get this from Things 3 → Settings → General → Enable Things URLs
THINGS_URL_AUTH_TOKEN=your-things-url-token-here

# Server bind address and port
THINGS_BIND_HOST=0.0.0.0
THINGS_PORT=8787
```

Or create it manually:

```
THINGS_TOKEN=your-random-api-token
THINGS_URL_AUTH_TOKEN=your-things-url-token
THINGS_BIND_HOST=0.0.0.0
THINGS_PORT=8787
```

**Two tokens are required:**

| Token | What it is | Where to get it |
|-------|-----------|----------------|
| `THINGS_TOKEN` | API token for authenticating browser requests | Generate any random string: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `THINGS_URL_AUTH_TOKEN` | Things 3 internal token for write operations | Things 3 → Settings → General → Enable Things URLs |

### 3. Run

```bash
source .venv/bin/activate
python server.py
```

### 4. Connect

Open your browser to:

- **Same Mac:** `http://localhost:8787`
- **Other devices on your network:** `http://<your-mac-ip>:8787`

Enter the `THINGS_TOKEN` value when prompted.

## API Reference

All `/api/*` endpoints require the `X-Things-Token` header.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check (no auth required) |
| `GET` | `/api/today` | — | List Today tasks (incomplete + completed today) |
| `POST` | `/api/tasks` | `{"title": "..."}` | Create a new task in Today |
| `PATCH` | `/api/tasks/{uuid}` | `{"notes": "..."}` | Update a task's notes |
| `POST` | `/api/tasks/{uuid}/complete` | — | Mark a task as complete |

### Example

```bash
# Set your token
export T="your-things-token"

# List today's tasks
curl -H "X-Things-Token: $T" http://localhost:8787/api/today

# Create a task
curl -X POST \
  -H "X-Things-Token: $T" \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries"}' \
  http://localhost:8787/api/tasks

# Complete a task
curl -X POST \
  -H "X-Things-Token: $T" \
  http://localhost:8787/api/tasks/TASK_UUID/complete

# Update notes
curl -X PATCH \
  -H "X-Things-Token: $T" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Milk, eggs, bread"}' \
  http://localhost:8787/api/tasks/TASK_UUID
```

## Project Structure

```
things-bridge/
  server.py            # FastAPI app — routes, auth, static file serving
  config.py            # Loads .env configuration
  things_bridge.py     # Things 3 integration (read via things.py, write via URL scheme)
  requirements.txt     # Python dependencies
  .env                 # Tokens and server config (not committed)
  static/
    index.html         # Web UI shell
    app.js             # Client-side logic (vanilla JS)
    styles.css         # Things 3-inspired styling
```

## Limitations

- **macOS only** — the server relies on the `open` command and Things 3 being installed
- **Plain HTTP** — fine for a home LAN; don't expose to the public internet without adding TLS
- **~800ms write delay** — after completing/creating/editing a task, the UI waits briefly before refreshing because Things 3 writes to its SQLite database asynchronously
- **Notes length** — limited to ~2000 characters per update due to URL scheme length constraints
- **Today list only** — other lists (Inbox, Upcoming, Anytime, etc.) are not exposed in this version

## License

MIT
