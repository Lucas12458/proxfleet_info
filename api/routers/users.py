from proxfleet.proxmox_manager import *
from proxfleet.proxmox_etu import *

from fastapi import Depends,APIRouter,HTTPException
from pydantic import BaseModel
import os
import dotenv
import logging
import yaml
from pathlib import Path

dotenv.load_dotenv()
logging.basicConfig(level=logging.DEBUG)


def get_proxmox_manager(host: str) -> ProxmoxManager:
    try:
        return ProxmoxManager(f"{host}.usmb-tri.fr", proxmox_user, proxmox_pass)
    except Exception as e:
        logging.error(f"Failed to connect to Proxmox host {host}: {e}")
        raise HTTPException(status_code=500,detail=f"Unable to connect to host {host}")

class UserCreate(BaseModel):
     realm: str = "pam"
     comment: str = ""

class StudentCreate(BaseModel):
    name:str
    login:str
    realm:str = "pam"
    promotion:str


router = APIRouter(tags=["Users"])
proxmox_user = os.getenv("PROXMOX_USER")
proxmox_pass = os.getenv("PROXMOX_PASSWORD")


@router.get("/server/{host}/users/")
async def get_users(proxmox_manager :ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.list_users()

@router.post("/server/{host}/user/")
async def create_user(userid:str,user_data:UserCreate,proxmox_manager :ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.create_user(userid=userid,realm=user_data.realm,comment=user_data.comment)
    
@router.post("/server/{host}/student/")
async def create_student(host:str,student_data:StudentCreate):
    proxmox_etu = ProxmoxEtu(proxmox_host=host,
                             proxmox_admin=proxmox_user,
                             proxmox_admin_password=proxmox_pass,
                             etu_nom=student_data.name,
                             etu_login=student_data.login,
                             realm=student_data.realm,
                             promotion=student_data.promotion
                             )
    return proxmox_etu.create()


@router.post("/server/{host}/group/{group}/user/{userid}")
async def add_user_to_group(group:str,userid:str,proxmox_manager :ProxmoxManager = Depends(get_proxmox_manager)):
   return proxmox_manager.add_user_to_group(userid,group)

@router.delete("/server/{host}")
async def delete_usmb_users(proxmox_manager :ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.delete_usmb_users()