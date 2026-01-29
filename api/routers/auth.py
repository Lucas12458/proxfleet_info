from fastapi import Depends, APIRouter, HTTPException,Response,Cookie
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.security import APIKeyCookie
from proxmoxer import ProxmoxAPI
from proxfleet.proxmox_authentication import *
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
    if not session_cookie:
        raise HTTPException(status_code=401,detail="Not authenticated")

    session = SESSIONS.get(session_cookie)
    if not session:
        raise HTTPException(status_code=401,detail="Not authenticated")

    if session["expires_at"] < time.time():
        del SESSIONS[session_cookie]
        raise HTTPException(status_code=401, detail="Session expired")

    return session


async def check_server_and_create_token(host: str, username: str,password: str) -> dict[str, dict] | None:
    
    host_url = f"{host}.usmb-tri.fr"
    try:
        await run_in_threadpool(ProxmoxAPI,host=host_url,user=username,password=password,verify_ssl=True)
        
        proxmox_auth = ProxmoxAuth(proxmox_host=host_url,admin_user=admin_user,admin_password=admin_pass,target_user=username)
        
        token_data = await run_in_threadpool(proxmox_auth.create_token,privsep=0,ttl_seconds=3600)
        
        return {host: token_data}

    except Exception as e:
        logging.warning(f"Server {host} inaccessible for user {username}: {e}")
        return None

@router.post("/auth/token")
async def login_for_access_token(data: LoginRequest):
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
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    
    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = {
        "user": user,
        "servers": server_tokens,
        "expires_at": time.time() + SESSION_EXPIRE_SECONDS
    }

   
    response = JSONResponse({
        "message": "Logged in",
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
async def logout(response: Response, session_id: str | None = Cookie(default=None)):
    if session_id:
        SESSIONS.pop(session_id, None)

    response.delete_cookie("session_id")
    return {"ok": True}




       

       

    

    





    