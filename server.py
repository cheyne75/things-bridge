import logging
import uuid as uuid_lib

from fastapi import FastAPI, Request, HTTPException, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config
import things_bridge

logger = logging.getLogger("things-bridge")

app = FastAPI(title="Things Bridge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["X-Things-Token", "Content-Type"],
)


async def verify_token(request: Request):
    token = request.headers.get("X-Things-Token")
    if token != config.THINGS_TOKEN:
        got = token or ""
        logger.warning(
            "Auth failed: got '%s...' (len=%d) expected '%s...' (len=%d)",
            got[:8], len(got),
            config.THINGS_TOKEN[:8], len(config.THINGS_TOKEN),
        )
        raise HTTPException(status_code=401, detail="Invalid or missing token")


api = APIRouter(prefix="/api", dependencies=[Depends(verify_token)])


class TaskCreate(BaseModel):
    title: str


class TaskUpdate(BaseModel):
    notes: str


class OrderUpdate(BaseModel):
    order: list[str]


@app.get("/health")
async def health():
    return {"status": "ok", "service": "things-bridge"}


@app.get("/mac")
async def get_mac():
    mac = uuid_lib.getnode()
    mac_str = ":".join(f"{(mac >> (8 * i)) & 0xFF:02X}" for i in range(5, -1, -1))
    return {"mac": mac_str}


@api.get("/today")
async def get_today():
    try:
        tasks = things_bridge.get_today_tasks()
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read tasks: {e}")


@api.post("/tasks", status_code=201)
async def create_task(body: TaskCreate):
    success = await things_bridge.create_task(body.title)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create task")
    return {"status": "created", "title": body.title}


@api.patch("/tasks/{uuid}")
async def update_task(uuid: str, body: TaskUpdate):
    success = await things_bridge.update_task_notes(uuid, body.notes)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update task")
    return {"status": "updated", "uuid": uuid}


@api.post("/tasks/{uuid}/complete")
async def complete_task(uuid: str):
    success = await things_bridge.complete_task(uuid)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to complete task")
    return {"status": "completed", "uuid": uuid}


@api.put("/order")
async def update_order(body: OrderUpdate):
    things_bridge.save_order(body.order)
    return {"status": "updated", "count": len(body.order)}


@api.delete("/order")
async def reset_order():
    things_bridge.clear_order()
    return {"status": "cleared"}


app.include_router(api)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.BIND_HOST, port=config.PORT)
