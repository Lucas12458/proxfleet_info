from proxfleet.proxmox_manager import *
from proxfleet.proxmox_vm import ProxmoxVM
from fastapi import Depends, APIRouter, HTTPException
from pydantic import BaseModel
import os
import dotenv

dotenv.load_dotenv()

def get_proxmox_manager(host: str) -> ProxmoxManager:
    return ProxmoxManager(f"{host}.usmb-tri.fr", proxmox_user, proxmox_pass)

def get_proxmox_vm(host: str, vmid: int) -> ProxmoxVM:
    return ProxmoxVM(f"{host}.usmb-tri.fr", proxmox_user, proxmox_pass, vmid)

router = APIRouter(tags=["Vms"])
proxmox_user = os.getenv("PROXMOX_USER")
proxmox_pass = os.getenv("PROXMOX_PASSWORD")

class VMAction(BaseModel):
    action: str  # start, stop, shutdown, reboot, delete

@router.get("/server/{host}/vm")
async def get_vms(host: str):
    proxmox_manager = ProxmoxManager(f"{host}.usmb-tri.fr", proxmox_user, proxmox_pass)
    vms = proxmox_manager.list_vms()
    for vm in vms:
        vmid = vm.get('vmid')
        if vmid:
            proxmox_vm = ProxmoxVM(f"{host}.usmb-tri.fr", proxmox_user, proxmox_pass, int(vmid))
            vm['status'] = proxmox_vm.status()
    return vms

@router.get("/server/{host}/vm/{vmid}")
async def get_vm_status(vmid: int, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    return {"status": proxmox_vm.status(), "agent_status": proxmox_vm.status_agent()}

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