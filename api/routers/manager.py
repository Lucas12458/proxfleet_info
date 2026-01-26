from proxfleet.proxmox_manager import *

from fastapi import Depends,APIRouter,HTTPException
from pydantic import BaseModel
import os
import dotenv
import logging
import yaml
from pathlib import Path

dotenv.load_dotenv()
logging.basicConfig(level=logging.DEBUG)



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

def get_proxmox_manager(host: str) -> ProxmoxManager:
    try:
        return ProxmoxManager(f"{host}.usmb-tri.fr", proxmox_user, proxmox_pass)
    except Exception as e:
        logging.error(f"Failed to connect to Proxmox host {host}: {e}")
        raise HTTPException(status_code=500,detail=f"Unable to connect to host {host}")



router = APIRouter(tags=["Manager"])
proxmox_user = os.getenv("PROXMOX_USER")
proxmox_pass = os.getenv("PROXMOX_PASSWORD")



# path to the projet root 
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# path to the yaml file
CONFIG_PATH = BASE_DIR / "config.yaml"


@router.get("/servers")
async def get_servers():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
            servers = config.get("servers", [])
    logging.debug(f"Configuration loaded: {len(servers)} servers found.")

    return servers
    
@router.get("/server/{host}/pools")
async def get_pools(proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.list_pools()

@router.get("/server/{host}/interfaces")
async def get_network_interfaces(vlan:str="all",proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.get_network_interfaces(vlan=vlan)    

@router.post("/server/{host}/group/{groupid}")
async def create_group(groupid:str,group_data:GroupCreate,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.create_group(groupid=groupid,comment=group_data.comment)

@router.post("/server/{host}/net/vmbr")
async def add_net_vmbr(vmbr_data:VmbrCreate,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.add_net_vmbr(vmbr_name=vmbr_data.name,comments=vmbr_data.comment,apply=vmbr_data.apply)

@router.post("/server/{host}/net/vlan")
async def add_net_vlan_vmbr(vlan_data:VmbrCreate,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.add_net_vlan_vmbr(vlan_id=vlan_data.name,comments=vlan_data.comment,apply=vlan_data.apply)

@router.post("/server/{host}/net/interface")
async def add_net_interface(interface_data:InterfaceCreate,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.add_net_interface(interface_name=interface_data.name,vlan_id=interface_data.vlan,apply=interface_data.apply)

@router.put("/server/{host}/network/apply")
async def network_apply(proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.network_apply()

@router.post("/server/{host}/permission")
async def add_permission(permission_data:PermissionCreate,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.add_permission(type=permission_data.type,ugid=permission_data.ugid,path=permission_data.path,roles=permission_data.roles)

@router.post("/server/{host}/role")
async def add_role(role_data:RoleCreate,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.add_role(roleid=role_data.roleid,privs=role_data.privs)

@router.post("/server/{host}/pool_storage")
async def add_pool_and_storage(pool_storage_data:PoolStorageCreate,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.add_pool_and_storage(poolid=pool_storage_data.poolid,storage=pool_storage_data.storage,comment=pool_storage_data.comment)

@router.post("/server/{host}/restore")
async def restore_backup(backup_data:BackupCreate,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.restore_backup(backup_file=backup_data.file,vmid=backup_data.vmid,path=backup_data.path)

@router.get("/server/{host}/task/status")
async def get_task_status(upid:str,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.get_task_status(upid=upid)

@router.get("/server/{host}/task/stopped")
async def check_task_stopped(upid:str,timeout_sec:int=300,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.check_task_stopped(upid=upid,timeout_sec=timeout_sec)

@router.get("/server/{host}/bridge")
async def check_bridge_exists(bridge_name:str,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.check_bridge_exists(bridge_name=bridge_name)

@router.get("/server/{host}/pool")
async def check_pool_exists(pool_name:str,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.check_pool_exists(pool_name=pool_name)


@router.get("/server/{host}/storage")
async def check_storage_exists(storage_name:str,proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.check_storage_exists(storage_name=storage_name)

@router.get("/server/{host}/nextvm")
async def get_next_vmid(proxmox_manager:ProxmoxManager = Depends(get_proxmox_manager)):
    return proxmox_manager.get_next_vmid()
