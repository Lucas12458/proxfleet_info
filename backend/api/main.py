from fastapi import FastAPI
from api.routers import manager,vms,users,files,auth
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import os

description = """"""

APP_PATH = os.getenv("APP_PATH", "/app2")
ENV_TYPE = os.getenv("ENV", "production")


app = FastAPI(
    title="Proxfleet API",
    description=description,
    root_path=f"{APP_PATH}/api",
    docs_url=None if ENV_TYPE == "production" else "/docs",
    redoc_url=None if ENV_TYPE == "production" else "/redoc",
    openapi_url=None if ENV_TYPE == "production" else "/openapi.json"
)

origins = [
    "http://localhost:5173",  # Dev React (Vite)
    "http://localhost:3000",  # Dev React (Classique)
    "http://localhost",       # Docker Front (Port 80)
    "http://127.0.0.1:5173",  # Alternative localhost
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(manager.router)
app.include_router(vms.router)
app.include_router(users.router)
app.include_router(files.router)
app.include_router(auth.router)
