import os
import sys

from dotenv import load_dotenv

load_dotenv()

THINGS_TOKEN = os.getenv("THINGS_TOKEN")
THINGS_URL_AUTH_TOKEN = os.getenv("THINGS_URL_AUTH_TOKEN")
BIND_HOST = os.getenv("THINGS_BIND_HOST", "0.0.0.0")
PORT = int(os.getenv("THINGS_PORT", "8787"))

if not THINGS_TOKEN:
    print("ERROR: THINGS_TOKEN not set in .env — cannot start server.", file=sys.stderr)
    sys.exit(1)

if not THINGS_URL_AUTH_TOKEN:
    print(
        "WARNING: THINGS_URL_AUTH_TOKEN not set in .env — "
        "write operations (complete/update) will fail. "
        "Get this from Things 3 → Settings → General → Enable Things URLs.",
        file=sys.stderr,
    )
