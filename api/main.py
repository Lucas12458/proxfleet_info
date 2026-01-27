from fastapi import FastAPI
from .routers import manager,vms,users,files,auth
from fastapi.staticfiles import StaticFiles
from pathlib import Path

description = """


"""
app = FastAPI(
    title="ProxfleetAPI",
    description=description,
    version="0.0.1",
   
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "front-end"

app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


app.include_router(manager.router)
app.include_router(vms.router)
app.include_router(users.router)
app.include_router(files.router)
app.include_router(auth.router)


@app.get("/")
async def root():
    return {"message": "Hello World"}