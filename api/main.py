from fastapi import FastAPI
from .routers import manager,vms,users,files,auth
from fastapi.staticfiles import StaticFiles
from pathlib import Path

description = """"""

app = FastAPI(
    title="ProxfleetAPI",
    description=description,
    version="0.0.1",
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"



app.include_router(manager.router,prefix="/api")
app.include_router(vms.router,prefix="/api")
app.include_router(users.router,prefix="/api")
app.include_router(files.router,prefix="/api")
app.include_router(auth.router,prefix="/api")

app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")