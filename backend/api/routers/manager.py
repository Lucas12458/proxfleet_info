from proxfleet.proxmox_manager import ProxmoxManager
from typing import Annotated
from api.routers import auth
from fastapi import Depends,APIRouter,HTTPException,status
from pydantic import BaseModel
from fastapi import FastAPI
from fastapi.responses import FileResponse
import os
import dotenv
import logging
import yaml
import aiofiles
from pathlib import Path


dotenv.load_dotenv()

log_level_str = os.getenv("LOG", "INFO").upper()
logging.basicConfig(level=log_level_str)

class GroupCreate(BaseModel):
    comment:str = ""

class VmbrCreate(BaseModel):
    name:str
    comment:str = ""
    apply:bool = True

class InterfaceCreate(BaseModel):
    name:str
    vlan:str
    apply:bool = True
class PermissionCreate(BaseModel):
    type:str
    ugid:str
    path:str
    roles:list

class RoleCreate(BaseModel):
    roleid:str
    privs:list

class PoolStorageCreate(BaseModel):
    poolid:str
    storage:str
    comment:str = ""

class BackupCreate(BaseModel):
    file:str
    vmid:str|None
    path:str = "/mnt/pve/nas-tri/dump/"

def get_token_for_host(host: str, session: dict) -> dict:
    server = session["servers"].get(host)
    if not server:
        raise HTTPException(status_code=403, detail="Forbidden")

    tokenid = server.get("tokenid")
    value = server.get("value")

    if not tokenid or not value:
        raise HTTPException(status_code=502, detail="Invalid token data")

    return {
        "token_name": tokenid,
        "token_value": value
    }

def get_proxmox_manager(host: str,session=Depends(auth.get_current_session)) -> ProxmoxManager:
    token = get_token_for_host(host, session)
    user = session["user"]
    
    return ProxmoxManager(proxmox_host=f"{host}.usmb-tri.fr",proxmox_user=user,use_token=True, token_name=token["token_name"],token_value=token["token_value"])


router = APIRouter(tags=["Manager"])

# path to the projet root 
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# path to the yaml file
CONFIG_PATH = BASE_DIR / "config.yaml"


MSG_CONFIG_NOT_FOUND = "Configuration file not found"
MSG_CONFIG_INVALID = "Invalid YAML configuration"

@router.get("/servers")
async def get_servers():
    """
    Retrieves the list of available Proxmox servers from the YAML config.
    """
    try:
        async with aiofiles.open(CONFIG_PATH, "r", encoding="utf-8") as f:
            content = await f.read() 
            
        config = yaml.safe_load(content)
        
        if not config:
            config = {}
            
        servers = config.get("servers", [])
        logging.debug(f"Configuration loaded: {len(servers)} servers found.")
        
        return servers

    except FileNotFoundError:
        logging.error(f"Config file missing at: {CONFIG_PATH}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=MSG_CONFIG_NOT_FOUND
        )
        
    except yaml.YAMLError as e:
        logging.error(f"Failed to parse YAML config: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=MSG_CONFIG_INVALID
        )
    
@router.get("/server/{host}/pools")
async def get_pools(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)]):
    return proxmox_manager.list_pools()

@router.get("/server/{host}/interfaces")
async def get_network_interfaces(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],vlan:str="all"):
    return proxmox_manager.get_network_interfaces(vlan=vlan)    

@router.post("/server/{host}/group/{groupid}")
async def create_group(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],groupid:str,group_data:GroupCreate):
    return proxmox_manager.create_group(groupid=groupid,comment=group_data.comment)

@router.post("/server/{host}/net/vmbr")
async def add_net_vmbr(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],vmbr_data:VmbrCreate):
    return proxmox_manager.add_net_vmbr(vmbr_name=vmbr_data.name,comments=vmbr_data.comment,apply=vmbr_data.apply)

@router.post("/server/{host}/net/vlan")
async def add_net_vlan_vmbr(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],vlan_data:VmbrCreate):
    return proxmox_manager.add_net_vlan_vmbr(vlan_id=vlan_data.name,comments=vlan_data.comment,apply=vlan_data.apply)

@router.post("/server/{host}/net/interface")
async def add_net_interface(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],interface_data:InterfaceCreate):
    return proxmox_manager.add_net_interface(interface_name=interface_data.name,vlan_id=interface_data.vlan,apply=interface_data.apply)

@router.put("/server/{host}/network/apply")
async def network_apply(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)]):
    return proxmox_manager.network_apply()

@router.post("/server/{host}/permission")
async def add_permission(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],permission_data:PermissionCreate):
    return proxmox_manager.add_permission(type=permission_data.type,ugid=permission_data.ugid,path=permission_data.path,roles=permission_data.roles)

@router.post("/server/{host}/role")
async def add_role(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],role_data:RoleCreate):
    return proxmox_manager.add_role(roleid=role_data.roleid,privs=role_data.privs)

@router.post("/server/{host}/pool_storage")
async def add_pool_and_storage(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],pool_storage_data:PoolStorageCreate):
    return proxmox_manager.add_pool_and_storage(poolid=pool_storage_data.poolid,storage=pool_storage_data.storage,comment=pool_storage_data.comment)

@router.post("/server/{host}/restore")
async def restore_backup(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],backup_data:BackupCreate):
    return proxmox_manager.restore_backup(backup_file=backup_data.file,vmid=backup_data.vmid,path=backup_data.path)

@router.get("/server/{host}/task/status")
async def get_task_status(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],upid:str):
    return proxmox_manager.get_task_status(upid=upid)

@router.get("/server/{host}/task/stopped")
async def check_task_stopped(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],upid:str,timeout_sec:int=300):
    return proxmox_manager.check_task_stopped(upid=upid,timeout_sec=timeout_sec)

@router.get("/server/{host}/task/log")
async def get_task_log(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],upid:str):
    return proxmox_manager.get_task_log(upid=upid)

@router.get("/server/{host}/tasks")
async def get_tasks(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)]):
    return proxmox_manager.get_tasks()

@router.get("/server/{host}/bridge")
async def check_bridge_exists(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],bridge_name:str):
    return proxmox_manager.check_bridge_exists(bridge_name=bridge_name)

@router.get("/server/{host}/pool")
async def check_pool_exists(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],pool_name:str):
    return proxmox_manager.check_pool_exists(pool_name=pool_name)


@router.get("/server/{host}/storage")
async def check_storage_exists(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],storage_name:str):
    return proxmox_manager.check_storage_exists(storage_name=storage_name)

@router.get("/server/{host}/nextvm")
async def get_next_vmid(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)]):
    return proxmox_manager.get_next_vmid()

