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
import os
import uuid
import time

load_dotenv()
logging.basicConfig(level=logging.DEBUG)
class LoginRequest(BaseModel):
    username: str
    password: str
    realm: str
    hosts: list[str]

# path to the projet root 
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# path to the yaml file
CONFIG_PATH = BASE_DIR / "config.yaml"

admin_user = os.getenv("PROXMOX_USER")
admin_pass = os.getenv("PROXMOX_PASSWORD")

SESSIONS = {}
SESSION_EXPIRE_SECONDS = 3600


router = APIRouter(tags=["Authentification"])

api_cookie = APIKeyCookie(name="session_cookie")


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


async def check_server_and_create_token(host: str, username: str,password: str) -> dict[str, dict] | None:
    """
    Attempt to connect to a Proxmox host and generate a scoped API token.
    """
    host_url = f"{host}.usmb-tri.fr"
    try:
        await run_in_threadpool(ProxmoxAPI,host=host_url,user=username,password=password,verify_ssl=False)
        
        proxmox_auth = ProxmoxAuth(proxmox_host=host_url,admin_user=admin_user,admin_password=admin_pass,target_user=username)
        
        token_data = await run_in_threadpool(proxmox_auth.create_token,privsep=0,ttl_seconds=3600)
        
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

    
    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = {
        "user": user,
        "servers": server_tokens,
        "expires_at": time.time() + SESSION_EXPIRE_SECONDS
    }

   
    response = JSONResponse({
        "message": "Successfully authenticated",
        "servers": list(server_tokens.keys())
    })
    response.set_cookie(
        key="session_cookie",
        value=session_id,
        max_age=SESSION_EXPIRE_SECONDS,
        httponly=True,  
        secure=False    
    )
    return response


@router.post("/auth/logout")
async def logout(response: Response,session: dict = Depends(get_current_session),session_cookie: str = Depends(api_cookie)):
    """
    Perform a full logout by deleting remote tokens and clearing local session.
    """
    
    servers = session.get("servers", {})
    user = session.get("user")
    for server, token_data in servers.items():
        tokenid = token_data.get("tokenid")
        
        if not tokenid:
            continue

        try:
            
            proxmox_auth = ProxmoxAuth(proxmox_host=f"{server}.usmb-tri.fr",admin_user=admin_user,admin_password=admin_pass,target_user=user)
            proxmox_auth.delete_token(tokenid)
        
        except Exception as e:
            logging.warning(f"Failed to delete token {tokenid} on {server}: {e}")


        
    SESSIONS.pop(session_cookie, None)
    response.delete_cookie("session_cookie")
    
    return {"ok": True, "message": "Logged out successfully"}




       

       

    

    





    