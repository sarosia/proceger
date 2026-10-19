# Proceger Admin Port & Task Lifecycle API Guide

This document describes how to programmatically interact with Proceger's unauthenticated **Admin Interface** (`adminPort`) to inspect, start, stop, and restart managed services.

It is designed for AI agents, automation bots, and local scripts running on the same host, container network, or behind an internal firewall.

---

## 1. Quick Start / Cheat Sheet

If you need to restart a service:

```bash
# 1. Discover all task names and current statuses
curl -s http://localhost:8081/task/list

# 2. Restart a specific task (e.g. "my-service")
curl -s http://localhost:8081/task/my-service/restart

# 3. Check recent stdout logs to confirm it booted properly
curl -s "http://localhost:8081/task/my-service/log/stdout.log?tail=30"
```

> **Expected response on restart:** Plain text `OK` with HTTP status `200`.

---

## 2. Admin Port vs. Public Port

Proceger operates in a dual-port architecture:

| Interface | Configuration Key | Default Example | Authentication | Primary Use Case |
|---|---|---|---|---|
| **Public Web UI** | `port` | `8080` | **Required** (Google OAuth 2.0 SSO) | Human browser access via reverse proxy / public domain. |
| **Admin Interface** | `adminPort` | `8081` | **None** (Bypasses all auth middleware) | Local agents, automated scripts, health checkers behind firewall. |

### Configuration Discovery
Check the `.procegerrc` file (in the project root or user home directory) to determine the configured ports:
```json
{
  "port": 8080,
  "adminPort": 8081
}
```
If you make requests to the public port without an authenticated session cookie, Proceger returns:
```json
HTTP/1.1 401 Unauthorized
{"error":"Unauthorized","message":"Authentication required. Please sign in with Google.","loginUrl":"/login"}
```
**Always send automated agent requests to `adminPort` (e.g. `http://localhost:8081`).**

---

## 3. Endpoints Reference

All endpoints below should be queried against `http://localhost:<adminPort>`:

### 3.1 List All Tasks
```http
GET /task/list
```
Returns an array of all registered tasks, their current state, PID, uptime, and available log files.

**Example:**
```bash
curl -s http://localhost:8081/task/list
```

**Response Format:**
```json
[
  {
    "name": "my-service",
    "command": "npm start",
    "git": null,
    "path": "/path/to/workspace/my-service",
    "revision": null,
    "pid": 12345,
    "startTime": "2026-01-01T00:00:00.000Z",
    "logs": ["stderr.log", "stdout.log"],
    "status": "RUNNING",
    "code": null,
    "enabled": true
  }
]
```

---

### 3.2 Restart a Task
```http
GET  /task/:name/restart
POST /task/:name/restart
```
Gracefully terminates the task's existing process tree (`SIGTERM`), waits for exit, and respawns the task using its configured command.

- Both `GET` and `POST` methods are accepted.
- No request body or query parameters are required.

**Examples:**
```bash
# Using GET
curl -s http://localhost:8081/task/my-service/restart

# Using POST
curl -s -X POST http://localhost:8081/task/my-service/restart
```

**Responses:**
- `200 OK` &rarr; Body: `OK` (Restart successful)
- `404 Not Found` &rarr; Body: `Task not found` (The specified task name does not exist)
- `400 Bad Request` &rarr; Body: `Cannot restart system task "proceger" from web UI.`
- `500 Internal Server Error` &rarr; Body: `Failed to restart: <error details>`

---

### 3.3 Start a Stopped Task
```http
GET  /task/:name/start
POST /task/:name/start
```
Starts a task that is currently in `STOPPED` state and marks `enabled: true`.

**Example:**
```bash
curl -s http://localhost:8081/task/my-service/start
```

---

### 3.4 Stop a Running Task
```http
GET  /task/:name/stop
POST /task/:name/stop
```
Terminates the process tree of a running task and marks `enabled: false`.

**Example:**
```bash
curl -s http://localhost:8081/task/my-service/stop
```

---

### 3.5 Poll Git Updates & Auto-Restart
```http
GET  /task/:name/poll
POST /task/:name/poll
```
For Git-backed tasks, checks the remote repository for new commits on the tracked branch. If new commits are detected, it pulls them, executes dependencies install (`npm ci`), and restarts the process.

**Response Format:**
```json
{
  "status": "OK",
  "updated": true,
  "message": "Updates pulled and task \"my-service\" restarted."
}
```

---

### 3.6 Inspect Task Logs
```http
GET /task/:name/log/:filename?tail=<N>
```
Fetches the content of a specific log file (e.g. `stdout.log`, `stderr.log`, or application-specific log).

- `:filename`: Name of the file listed in the task's `logs` array.
- `tail`: *(Optional)* Number of recent lines to retrieve from the end of the file.

**Examples:**
```bash
# View last 50 lines of standard output
curl -s "http://localhost:8081/task/my-service/log/stdout.log?tail=50"

# View last 50 lines of standard error
curl -s "http://localhost:8081/task/my-service/log/stderr.log?tail=50"
```

**Response Format:**
```json
{
  "filename": "stdout.log",
  "content": "Server listening on port 3000\nReady to handle requests.\n",
  "totalLines": 42
}
```

---

## 4. Common Troubleshooting / Pitfalls for AI Agents

| Issue / Error | Cause | Solution |
|---|---|---|
| **`401 Unauthorized`** | Request sent to public `port` (e.g. `8080`) instead of `adminPort` (e.g. `8081`). | Change port in URL to the configured `adminPort`. |
| **`404 Cannot POST /task/...`** | Request sent to older version of Proceger that only supported `GET`. | Use `GET http://localhost:<adminPort>/task/:name/restart`. |
| **`404 Task not found`** | The task name does not match what Proceger has registered. | Run `GET /task/list` first to inspect exact registered names (case-sensitive). |
| **`400 Cannot restart system task "proceger"`** | Attempting to restart `"proceger"` itself via the task API. | The `"proceger"` entry in `/task/list` is the manager process itself and cannot be restarted via its own HTTP endpoints. |
| **Connection Refused (`ECONNREFUSED`)** | Proceger is not running, or calling from another container without network access. | Verify Proceger is running (`ps aux \| grep proceger`). If calling across Docker containers, ensure the container network reaches the host's admin port. |

---

## 5. Agent Implementation Examples

### Bash / cURL Function
```bash
restart_service() {
  local service_name="$1"
  local admin_port="${2:-8081}"
  
  echo "Restarting service '${service_name}' on port ${admin_port}..."
  local response
  response=$(curl -s -w "\n%{http_code}" "http://localhost:${admin_port}/task/${service_name}/restart")
  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq 200 ] && [ "$body" = "OK" ]; then
    echo "✓ Successfully restarted ${service_name}."
    return 0
  else
    echo "✗ Failed to restart ${service_name} (HTTP ${http_code}): ${body}"
    return 1
  fi
}

# Usage:
restart_service "my-service"
```

### Python
```python
import urllib.request
import json

def restart_task(task_name: str, admin_port: int = 8081) -> bool:
    url = f"http://localhost:{admin_port}/task/{task_name}/restart"
    req = urllib.request.Request(url, method="POST")  # or "GET"
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            if resp.status == 200 and body.strip() == "OK":
                print(f"Successfully restarted {task_name}")
                return True
    except Exception as e:
        print(f"Failed to restart {task_name}: {e}")
    return False

# Usage:
restart_task("my-service")
```

### Node.js
```javascript
async function restartTask(taskName, adminPort = 8081) {
  const url = `http://localhost:${adminPort}/task/${taskName}/restart`;
  const res = await fetch(url, { method: 'POST' }); // or 'GET'
  if (!res.ok) {
    throw new Error(`Failed to restart ${taskName}: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  console.log(`Task ${taskName} restart result:`, text);
  return text === 'OK';
}

// Usage:
// await restartTask('my-service');
```
