import asyncio
import json
import subprocess
from datetime import date
from pathlib import Path
from urllib.parse import quote

import things

import config

ORDER_FILE = Path(__file__).parent / "order.json"

_write_lock = asyncio.Lock()


def _normalize_task(task: dict) -> dict:
    return {
        "uuid": task["uuid"],
        "title": task.get("title", ""),
        "notes": task.get("notes", ""),
        "status": task.get("status", "incomplete"),
        "today_index": task.get("today_index", 0),
    }


def load_order() -> list[str]:
    try:
        data = json.loads(ORDER_FILE.read_text())
        return data.get("order", [])
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return []


def save_order(order: list[str]) -> None:
    ORDER_FILE.write_text(json.dumps({"order": order}, indent=2))


def clear_order() -> None:
    try:
        ORDER_FILE.unlink()
    except FileNotFoundError:
        pass


def get_today_tasks() -> list[dict]:
    incomplete = things.today()
    today_str = date.today().isoformat()
    completed = things.completed(stop_date=today_str)

    saved_order = load_order()
    task_map = {t["uuid"]: t for t in incomplete}

    # Tasks in saved order that still exist
    ordered = []
    for uuid in saved_order:
        if uuid in task_map:
            ordered.append(_normalize_task(task_map.pop(uuid)))

    # New tasks not in saved order, in Things' native order
    for t in incomplete:
        if t["uuid"] in task_map:
            ordered.append(_normalize_task(t))

    # Completed tasks at the end
    ordered += [_normalize_task(t) for t in completed]

    return ordered


def _complete_task(uuid: str) -> bool:
    url = (
        f"things:///update"
        f"?auth-token={config.THINGS_URL_AUTH_TOKEN}"
        f"&id={uuid}"
        f"&completed=true"
    )
    result = subprocess.run(["open", url], capture_output=True, timeout=5)
    return result.returncode == 0


def _update_task_notes(uuid: str, notes: str) -> bool:
    encoded_notes = quote(notes, safe="")
    url = (
        f"things:///update"
        f"?auth-token={config.THINGS_URL_AUTH_TOKEN}"
        f"&id={uuid}"
        f"&notes={encoded_notes}"
    )
    result = subprocess.run(["open", url], capture_output=True, timeout=5)
    return result.returncode == 0


def _create_task(title: str) -> bool:
    encoded_title = quote(title, safe="")
    url = f"things:///add?title={encoded_title}&when=today&reveal=false"
    result = subprocess.run(["open", url], capture_output=True, timeout=5)
    return result.returncode == 0


async def complete_task(uuid: str) -> bool:
    async with _write_lock:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _complete_task, uuid)


async def update_task_notes(uuid: str, notes: str) -> bool:
    async with _write_lock:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _update_task_notes, uuid, notes)


async def create_task(title: str) -> bool:
    async with _write_lock:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _create_task, title)
