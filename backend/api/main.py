from fastapi import FastAPI,Request
from fastapi.responses import HTMLResponse
from api.routers import manager,vms,users,files,auth
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from api.exceptions.exceptions import (ProxmoxResourceNotFoundError, 
                                       ProxmoxConnectionError,
                                       ProxmoxUnauthorizedError,
                                       ProxmoxInvalidTokenError,
                                       ProxmoxAPIError,
                                       ProxmoxTaskTimeoutError,
                                       ProxfleetError,
                                       AdminConfigurationError
                                       )
import os
import logging

description = """"""

APP_PATH = os.getenv("APP_PATH", "/app2")
ENV_TYPE = os.getenv("ENV", "dev")


app = FastAPI(
    title="Proxfleet API",
    description=description,
    root_path=f"{APP_PATH}/api",
    docs_url=None if ENV_TYPE == "production" else "/docs",
    redoc_url=None if ENV_TYPE == "production" else "/redoc",
    openapi_url=None if ENV_TYPE == "production" else "/openapi.json",
    
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


@app.get("/", response_class=HTMLResponse)
async def api_root():
    """
    Renders a simple HTML landing page for the API.
    Provides links to the frontend and the API documentation.
    """
    api_title = "ProxFleet API"
    api_version = "1.0.0"

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{api_title}</title>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f3f4f6; margin: 0; }}
            .container {{ text-align: center; background: white; padding: 3rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }}
            h1 {{ color: #1a2744; }}
            p {{ color: #6b7280; margin-bottom: 2rem; }}
            .btn {{ display: inline-block; padding: 10px 20px; margin: 5px; text-decoration: none; border-radius: 6px; font-weight: bold; transition: background-color 0.2s; }}
            .btn-primary {{ background-color: #2d6cdf; color: white; }}
            .btn-primary:hover {{ background-color: #1e4bb8; }}
            .btn-secondary {{ background-color: #e5e7eb; color: #1a2744; }}
            .btn-secondary:hover {{ background-color: #d1d5db; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Welcome to {api_title}</h1>
            <p>Version {api_version} - Proxmox servers manager</p>
            <div>
                <a href="/docs" class="btn btn-secondary">API Documentation</a>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)





@app.exception_handler(ProxmoxResourceNotFoundError)
async def resource_not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"detail": str(exc)})

@app.exception_handler(ProxmoxConnectionError)
async def connection_error_handler(request, exc):
    return JSONResponse(status_code=502, content={"detail": str(exc)})

@app.exception_handler(ProxmoxUnauthorizedError)
async def unauthorized_handler(request: Request, exc: ProxmoxUnauthorizedError):
    return JSONResponse(
        status_code=403,
        content={"detail": f"Access denied to host {exc.host} for user {exc.user}"}
    )

@app.exception_handler(ProxmoxInvalidTokenError)
async def invalid_token_handler(request: Request, exc: ProxmoxInvalidTokenError):
    return JSONResponse(
        status_code=502,
        content={"detail": f"Authentication data for {exc.host} is corrupted."}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logging.critical(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"message": "An unexpected server error occurred."}
    )

@app.exception_handler(ProxmoxAPIError)
async def api_error_handler(request: Request, exc: ProxmoxAPIError):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)}
    )

@app.exception_handler(ProxmoxTaskTimeoutError)
async def task_timeout_handler(request: Request, exc: ProxmoxTaskTimeoutError):
    return JSONResponse(
        status_code=504,
        content={"detail": str(exc), "upid": exc.upid}
    )

@app.exception_handler(ProxfleetError)
async def base_proxfleet_handler(request: Request, exc: ProxfleetError):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

@app.exception_handler(AdminConfigurationError)
async def admin_config_handler(request: Request, exc: AdminConfigurationError):
    """
    Handles AdminConfigurationError and returns the appropriate HTTP status code.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message}
    )