from fastapi import FastAPI
from .routers import manager, vms, users, files
from fastapi.staticfiles import StaticFiles
from pathlib import Path

description = """"""

app = FastAPI(
    title="ProxfleetAPI",
    description=description,
    version="0.0.1",
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "front-end"

app.mount("/front-end", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="front-end")

app.include_router(manager.router)
app.include_router(vms.router)
app.include_router(users.router)
app.include_router(files.router)

@app.get("/")
async def root():
    return {"message": "Hello World"}
