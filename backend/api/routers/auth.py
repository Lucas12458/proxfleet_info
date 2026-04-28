from fastapi import Depends, APIRouter, HTTPException,Response,Cookie
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.security import APIKeyCookie
from proxmoxer import ProxmoxAPI
from proxfleet.proxmox_authentication import ProxmoxAuth
from api.exceptions.exceptions import (
    ProxmoxUnauthorizedError, 
    ProxmoxInvalidTokenError, 
    ProxfleetError
)
from pydantic import BaseModel
from dotenv import load_dotenv
from pathlib import Path
import logging
import asyncio
import aiofiles
import os
import json
import uuid
import time

load_dotenv()

log_level_str = os.getenv("LOG", "INFO").upper()

logging.basicConfig(level=log_level_str)

class LoginRequest(BaseModel):
    username: str
    password: str
    realm: str
    hosts: list[str]

# path to the projet root 
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# path to the yaml file
CONFIG_PATH = BASE_DIR / "config.yaml"

# Path to the shared volume where the whitelist is stored
ADMINS_FILE_PATH = "/app/config/admins.json"



SESSIONS = {}
SESSION_EXPIRE_SECONDS = 3600


router = APIRouter(tags=["Authentification"])

api_cookie = APIKeyCookie(name="session_cookie")



async def get_effective_role_async(username: str, role: str) -> str:
    if os.path.exists(ADMINS_FILE_PATH):
        try:
            async with aiofiles.open(ADMINS_FILE_PATH, mode='r') as f:
                content = await f.read()
                admins_list = json.loads(content)
                if username in admins_list:
                    return "admin"
        except json.JSONDecodeError:
            logging.error("The admins.json file is improperly formatted.")
    return role



def get_current_session(session_cookie: str = Depends(api_cookie)):
    """
    Validate the session cookie and return the session data.

    Check if the cookie exists, if the session is still in memory, 
    and if it hasn't expired yet.
    """
    if not session_cookie:
        raise ProxmoxUnauthorizedError(host="N/A", user="Anonymous", reason="No session cookie provided")

    session = SESSIONS.get(session_cookie)
    if not session:
        raise ProxmoxUnauthorizedError(host="N/A", user="Unknown", reason="Session not found or expired")

    if session["expires_at"] < time.time():
        del SESSIONS[session_cookie]
        raise ProxmoxUnauthorizedError(host="N/A", user=session.get("user"), reason="Session expired")

    return session

async def verify_admin_rights(current_session = Depends(get_current_session)):
    """
    FastAPI dependency to protect sensitive routes.
    Re-verifies admin status in real-time against the whitelist.
    
    Args:
        current_session (dict): The session data retrieved from the cookie.
        
    Raises:
        HTTPException: 403 Forbidden if the user lacks administrative rights.
        
    Returns:
        dict: The validated session data.
    """
    username = current_session["user"].split("@")[0]
    effective_role = await get_effective_role_async(username,current_session["role"])
    
    if effective_role not in ["admin"]:
       raise HTTPException(
            status_code=403,
            detail=f"Access denied for {username}. Admin privileges required."
        )
    return current_session


async def check_server_and_create_token(host: str, username: str, password: str) -> dict[str, dict] | None:
    """
    Attempt to connect to a Proxmox host, clean old tokens, and generate a scoped API token.
    """
    host_url = f"{host}.usmb-tri.fr"
    try:
        # Instantiate with user password
        proxmox_auth = ProxmoxAuth(proxmox_host=host_url, proxmox_user=username, proxmox_password=password)
        
        # Clean up tokens from previous sessions
        await run_in_threadpool(proxmox_auth.clean_old_tokens)
        
        # Generate a new scoped token
        token_data = await run_in_threadpool(proxmox_auth.create_token, privsep=0, ttl_seconds=3600)
        
        return {host: token_data}

    except Exception as e:
        logging.warning(f"Server {host} inaccessible for user {username}: {e}")
        return None

@router.post("/auth/token")
async def login_for_access_token(data: LoginRequest):
    """
    Main login endpoint. Aggregates tokens from multiple Proxmox hosts 
    and creates a local unified session.
    """
    user = f"{data.username}@{data.realm}"
    password = data.password
    hosts_list = data.hosts

    tasks = [check_server_and_create_token(host, user, password) for host in hosts_list]
    results = await asyncio.gather(*tasks)

    server_tokens: dict[str, dict] = {}
    for result in results:
        if result:
            for host, token_data in result.items():
                server_tokens[host] = token_data

    if not server_tokens:
        failed_hosts = ", ".join(data.hosts)
        raise ProxmoxUnauthorizedError(host=failed_hosts, user=user, reason="Invalid credentials or all hosts unreachable")

    # Determine the role (checking the whitelist)
    # Default role is assumed to be 'student' or equivalent from Proxmox
    default_role = "student" 
    
    effective_role = await get_effective_role_async(data.username, default_role)
    
    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = {
        "user": user,
        "role": effective_role,
        "servers": server_tokens,
        "expires_at": time.time() + SESSION_EXPIRE_SECONDS
    }

   
    response = JSONResponse({
        "message": "Successfully authenticated",
        "servers": list(server_tokens.keys()),
        "user_info": {
            "username": data.username,
            "role": effective_role
        }
    })
    response.set_cookie(
        key="session_cookie",
        value=session_id,
        max_age=SESSION_EXPIRE_SECONDS,
        httponly=True,  
        secure=os.getenv("ENVIRONMENT") == "production"
    )
    return response


@router.post("/auth/logout")
async def logout(response: Response,session: dict = Depends(get_current_session),session_cookie: str = Depends(api_cookie)):
    """
    Perform a full logout by deleting remote tokens and clearing local session.
    """
    
    SESSIONS.pop(session_cookie, None)
    response.delete_cookie("session_cookie")
    
    return {"ok": True, "message": "Logged out successfully"}


    





    