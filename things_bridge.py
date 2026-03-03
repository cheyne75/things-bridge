import asyncio
import subprocess
from datetime import date
from urllib.parse import quote

import things

import config

_write_lock = asyncio.Lock()


def _normalize_task(task: dict) -> dict:
    return {
        "uuid": task["uuid"],
        "title": task.get("title", ""),
        "notes": task.get("notes", ""),
        "status": task.get("status", "incomplete"),
    }


def get_today_tasks() -> list[dict]:
    incomplete = things.today()
    today_str = date.today().isoformat()
    completed = things.completed(stop_date=today_str)
    result = [_normalize_task(t) for t in incomplete]
    result += [_normalize_task(t) for t in completed]
    return result


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
