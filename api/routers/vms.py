from proxfleet.proxmox_manager import *
from proxfleet.proxmox_vm import ProxmoxVM
from fastapi import Depends, APIRouter, HTTPException
from pydantic import BaseModel,Field
import os
import dotenv

dotenv.load_dotenv()

def get_proxmox_manager(host: str) -> ProxmoxManager:
    try:
        return ProxmoxManager(f"{host}.usmb-tri.fr", proxmox_user, proxmox_pass)
    except Exception as e:
        logging.error(f"Failed to connect to Proxmox host {host}: {e}")
        raise HTTPException(status_code=500,detail=f"Unable to connect to host {host}")

def get_proxmox_vm(host: str, vmid: int) -> ProxmoxVM:
    try:
        return ProxmoxVM(f"{host}.usmb-tri.fr", proxmox_user, proxmox_pass, vmid)
    except Exception as e:
        logging.error(f"Failed to connect to Proxmox host {host}: {e}")
        raise HTTPException(status_code=500,detail=f"Unable to connect to host {host}")

router = APIRouter(tags=["Vms"])

proxmox_user = os.getenv("PROXMOX_USER")
proxmox_pass = os.getenv("PROXMOX_PASSWORD")

class VMAction(BaseModel):
    action: str  # start, stop, shutdown, reboot, delete

class CloneVMRequest(BaseModel):
    newid: int |None = Field(default=None, gt=0)
    name: str
    template : int
    pool: str
    storage: str 

@router.get("/server/{host}/vm")
async def get_vms(host:str,proxmox_manager : ProxmoxManager = Depends(get_proxmox_manager)):
    try:
        vms = proxmox_manager.list_vms()
        return vms
    except Exception as e:
        logging.error(f"Error fetching VMs from {host}: {e}")
        raise HTTPException(status_code=500,detail="Unable to fetch VMs")
    
    


@router.get("/server/{host}/vm/{vmid}")
async def get_vm_status(host:str,vmid: int, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    try:
        return {"status": proxmox_vm.status(), "agent_status": proxmox_vm.status_agent()}
    except Exception as e:
        logging.error(f"Error fetching VM {vmid} from {host}: {e}")
        raise HTTPException(status_code=500,detail=f"Unable to fetch VM {vmid} from host {host}")

@router.post("/server/{host}/vm/{vmid}/action")
async def vm_action(vmid: int, action_data: VMAction, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    actions = {
        "start": proxmox_vm.start,
        "stop": proxmox_vm.stop,
        "shutdown": proxmox_vm.shutdown,
        "reboot": proxmox_vm.reboot,
        "delete": proxmox_vm.delete
    }
    if action_data.action not in actions:
        raise HTTPException(status_code=400, detail="Invalid action")
    return actions[action_data.action]()

@router.get("/server/{host}/vm/{vmid}/network")
async def get_vm_network(vmid: int, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    return {"interfaces": proxmox_vm.get_network_interfaces(), "management_ip": proxmox_vm.management_ip()}

@router.post("/server/{host}/vm/clone")
async def clone_vm(host:str,vm_data : CloneVMRequest,proxmox_manager: ProxmoxManager = Depends(get_proxmox_manager)):
    proxmox_vm = ProxmoxVM(proxmox_host=f"{host}.usmb-tri.fr",proxmox_user=proxmox_user,proxmox_password=proxmox_pass)
    proxmox_vm.newid = vm_data.newid or proxmox_manager.get_next_vmid()
    proxmox_vm.name_vm = vm_data.name
    proxmox_vm.template_vm = vm_data.template
    proxmox_vm.pool_vm = vm_data.pool
    proxmox_vm.storage_vm = vm_data.storage
    return proxmox_vm.clone_vm()