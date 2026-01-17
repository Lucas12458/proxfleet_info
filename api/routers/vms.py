from proxfleet.proxmox_manager import *

from fastapi import Depends,APIRouter
from pydantic import BaseModel
import os
import dotenv
import logging
import yaml
from pathlib import Path

dotenv.load_dotenv()
logging.basicConfig(level=logging.DEBUG)


def get_proxmox_manager(host: str) -> ProxmoxManager:
    return ProxmoxManager(f"{host}.usmb-tri.fr",proxmox_user,proxmox_pass)




router = APIRouter(tags=["Vms"])
proxmox_user = os.getenv("PROXMOX_USER")
proxmox_pass = os.getenv("PROXMOX_PASSWORD")


@router.get("/server/{host}/vm")
async def get_vms(proxmox_manager :ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.list_vms()
