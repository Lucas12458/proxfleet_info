from proxfleet.proxmox_manager import ProxmoxManager
from proxfleet.proxmox_vm import ProxmoxVM
from proxfleet.proxmox_authentication import ProxmoxAuth
from api.routers import auth
from api.exceptions.exceptions import (
    ProxmoxUnauthorizedError,
    ProxmoxInvalidTokenError,
    ProxmoxConnectionError,
    ProxmoxAPIError,
    ProxmoxResourceNotFoundError
)
from fastapi import Depends, APIRouter, HTTPException
from pydantic import BaseModel,Field
import os
import dotenv
import logging

dotenv.load_dotenv()

log_level_str = os.getenv("LOG", "INFO").upper()
logging.basicConfig(level=log_level_str)

class VMAction(BaseModel):
    action: str  # start, stop, shutdown, reboot, delete

class CloneVMRequest(BaseModel):
    newid: int |None = Field(default=None, gt=0)
    name: str
    template : int
    pool: str
    storage: str 

def get_token_for_host(host: str, session: dict) -> dict:
    """
    Extract the Proxmox API token for a specific host from the user session.

    Args:
        host: The target Proxmox hostname.
        session: The current active session dictionary.

    Returns:
        dict: A dictionary containing 'token_name' and 'token_value'.

    Raises:
        ProxmoxUnauthorizedError : If the host is not authorized in the session.
        ProxmoxInvalidTokenError : If token data is missing or corrupted.
    """
    server = session["servers"].get(host)
    if not server:
        raise ProxmoxUnauthorizedError(host=host, user=session.get("user"), reason="Host not in session scope")

    tokenid = server.get("tokenid")
    value = server.get("value")

    if not tokenid or not value:
        raise ProxmoxInvalidTokenError(host=host, token_id=tokenid)
    
    return {
        "token_name": tokenid,
        "token_value": value
    }


def get_proxmox_manager(host: str, session=Depends(auth.get_current_session)) -> ProxmoxManager:
    """
    Dependency to provide a ProxmoxManager instance for a specific host.
    Validates session access and token integrity.
    """
    if "servers" not in session or host not in session["servers"]:
        raise ProxmoxUnauthorizedError(
            host=host, 
            user=session.get("user", "Unknown"), 
            reason="Access to this specific Proxmox host is not authorized for your session."
        )

    token = get_token_for_host(host, session)
    user = session["user"]
    
    try:
        return ProxmoxManager(
            proxmox_host=f"{host}.usmb-tri.fr",
            proxmox_user=user,
            use_token=True, 
            token_name=token["token_name"],
            token_value=token["token_value"]
        )
    except Exception as e:
        logging.error(f"Failed to connect to Proxmox host {host}: {e}")
        raise ProxmoxConnectionError(host=host)

   

def get_proxmox_vm(host: str, vmid: int, session=Depends(auth.get_current_session)) -> ProxmoxVM:
    """
    Dependency to provide a ProxmoxVM instance.
    Checks host access before initializing.
    """
    if host not in session.get("servers", {}):
        raise ProxmoxUnauthorizedError(
            host=host, 
            user=session.get("user"), 
            reason="Access to this host is not permitted in your current session."
        )

    token = get_token_for_host(host, session)
    
    try:
        manager = get_proxmox_manager(host=host, session=session)
        return ProxmoxVM(manager=manager, vmid=vmid)
    except Exception as e:
        raise ProxmoxConnectionError(host=host)

def get_proxmox_vm_for_clone(host: str, vm_data: CloneVMRequest, session=Depends(auth.get_current_session)) -> ProxmoxVM:
    """
    Special dependency for VM cloning operations.
    Validates host access and maps request data.
    """
    if host not in session.get("servers", {}):
        raise ProxmoxUnauthorizedError(
            host=host, 
            user=session.get("user"), 
            reason="Access to this host is not permitted in your current session."
        )

    try:
        manager = get_proxmox_manager(host=host, session=session)
        vm = ProxmoxVM(manager=manager)

        if not vm_data.template:
            raise ProxmoxAPIError("A source template ID is required for cloning.")

        vm.newid = vm_data.newid
        vm.name_vm = vm_data.name
        vm.template_vm = vm_data.template
        vm.pool_vm = vm_data.pool
        vm.storage_vm = vm_data.storage

        return vm

    except (ProxmoxUnauthorizedError, ProxmoxInvalidTokenError):
        raise
    except Exception as e:
        raise ProxmoxAPIError(f"Failed to initialize clone request for host {host}: {str(e)}")


router = APIRouter(tags=["Vms"])



@router.get("/server/{host}/vm")
async def get_vms(host: str, proxmox_manager: ProxmoxManager = Depends(get_proxmox_manager)):
    """
    List all Virtual Machines available on the specified Proxmox host.
    """
    try:
        return proxmox_manager.list_vms()
    except Exception as e:
        raise ProxmoxAPIError(f"Failed to list VMs on host {host}: {str(e)}")
        
    
    
@router.get("/server/{host}/vm/{vmid}")
async def get_vm_status(host: str, vmid: int, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    """
    Retrieve the current power status and QEMU guest agent status for a specific VM.
    """
    try:
        return {"status": proxmox_vm.status(), "agent_status": proxmox_vm.status_agent()}
    except Exception as e:
        error_msg = str(e)
        
        if "404" in error_msg or "not exist" in error_msg.lower():
            raise ProxmoxResourceNotFoundError(resource_type="VM",resource_id=str(vmid),host=host)
            
        
        raise ProxmoxAPIError(f"Failed to retrieve status for VM {vmid}: {error_msg}")


@router.post("/server/{host}/vm/{vmid}/action")
async def vm_action(vmid: int, action_data: VMAction, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    """
    Execute a power or lifecycle action on the VM.
    
    Supported actions: **start**, **stop**, **shutdown**, **reboot**, **delete**.
    """
    
    actions = {
        "start": proxmox_vm.start,
        "stop": proxmox_vm.stop,
        "shutdown": proxmox_vm.shutdown,
        "reboot": proxmox_vm.reboot,
        "delete": proxmox_vm.delete
    }
    if action_data.action not in actions:
        raise ProxmoxAPIError(f"Action '{action_data.action}' is not supported for VM {vmid}.")
    
    try:
        return actions[action_data.action]()
    except Exception as e:
        raise ProxmoxAPIError(f"Failed to execute {action_data.action} on VM {vmid}: {str(e)}")

    
@router.get("/server/{host}/vm/{vmid}/network")
async def get_vm_network(host: str, vmid: int, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    """
    Fetch network interface configurations and the primary management IP address of the VM.
    """
    try:
        return {"interfaces": proxmox_vm.get_network_interfaces(), "management_ip": proxmox_vm.management_ip()}
    except Exception as e:
        error_msg = str(e)
        
        if "403" in error_msg or "Permission check failed" in error_msg:
            raise ProxmoxUnauthorizedError(host=host, user="current_user", reason=f"Insufficient permissions (VM.Monitor) for VM {vmid}")
            
        elif "agent" in error_msg.lower() or "500" in error_msg:
            raise ProxmoxConnectionError(host=f"{host} (QEMU Agent on VM {vmid} not responding)")
            
        else:
            raise ProxmoxAPIError(f"Internal error while reading network data: {error_msg}")


@router.post("/server/{host}/vm/clone")
async def clone_vm(host: str, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm_for_clone), proxmox_manager: ProxmoxManager = Depends(get_proxmox_manager)):
    """
    Create a clone of an existing VM.
    Automatically assigns the next available ID if none is provided.
    """
    if proxmox_vm.newid is None:
        try:
            proxmox_vm.newid = proxmox_manager.get_next_vmid()
        except Exception as e:
            raise ProxmoxAPIError(f"Failed to generate a new VMID on host {host}: {str(e)}")
    else:
        if proxmox_manager.is_vmid_used(proxmox_vm.newid):
            raise ProxmoxAPIError(
                f"Conflict: VMID {proxmox_vm.newid} is already in use on host {host}."
            )

    try:
        logging.info(f"Cloning VM {proxmox_vm.template_vm} to new ID {proxmox_vm.newid} on {host}...")
        
        result = proxmox_vm.clone_vm()
        
        return {
            "message": "Cloning process started successfully",
            "vmid": proxmox_vm.newid,
            "task_id": result
        }

    except Exception as e:
        error_msg = str(e)
        if "not exist" in error_msg.lower():
             raise ProxmoxResourceNotFoundError(
                 resource_type="Template", 
                 resource_id=str(proxmox_vm.template_vm), 
                 host=host
             )
        
        raise ProxmoxAPIError(f"Cloning failed: {error_msg}")