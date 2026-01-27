from datetime import datetime, timedelta, timezone
from fastapi import Depends, APIRouter, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Annotated
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import logging
import jwt
import yaml
from pathlib import Path
from proxmoxer import ProxmoxAPI
from fastapi.concurrency import run_in_threadpool
import asyncio


load_dotenv()
logging.basicConfig(level=logging.DEBUG)

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None

class User(BaseModel):
    login: str
    servers: list[str]
    disabled: bool | None = None


# path to the projet root 
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# path to the yaml file
CONFIG_PATH = BASE_DIR / "config.yaml"


router = APIRouter(tags=["Authentification"])


def check_server(host, username, password):
    ProxmoxAPI(host=host, user=username, password=password, verify_ssl=True)
    return host

async def authenticate_user(username: str, password: str) -> User | None:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    servers = config.get("servers", [])
    tasks = []

    for s in servers:
        host = s.get("usmb-tri")
        if host:
            tasks.append(
                run_in_threadpool(check_server, host, username, password)
            )

    results = await asyncio.gather(*tasks, return_exceptions=True)

    allowed = []
    for s, r in zip(servers, results):
        if not isinstance(r, Exception):
            allowed.append(s["host"])

    if not allowed:
        return None

    return User(login=username, servers=allowed, disabled=False)

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return User(login=payload["sub"],servers=payload["servers"],disabled=False)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )



@router.post("/auth/token")
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Token:

    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={
            "sub": user.login,
            "servers": user.servers
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return Token(access_token=access_token, token_type="bearer")
