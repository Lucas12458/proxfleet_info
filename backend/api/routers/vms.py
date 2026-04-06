from proxfleet.proxmox_manager import ProxmoxManager
from proxfleet.proxmox_vm import ProxmoxVM
from proxfleet.proxmox_authentication import ProxmoxAuth
from api.routers import auth
from api.exceptions.exceptions import ProxmoxUnauthorizedError,ProxmoxInvalidTokenError,ProxmoxConnectionError
from fastapi import Depends, APIRouter, HTTPException
from pydantic import BaseModel,Field
import os
import dotenv
import logging

dotenv.load_dotenv()
logging.basicConfig(level=logging.DEBUG)

admin_user = os.getenv("PROXMOX_USER")
admin_pass = os.getenv("PROXMOX_PASSWORD")

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


def get_proxmox_auth(host:str,session=Depends(auth.get_current_session)) -> ProxmoxAuth:
    """
    Initialize a ProxmoxAuth instance for a specific host using session credentials.

    This dependency verifies that the user has access to the requested host
    and that valid API token data exists within their session.

    Args:
        host: The target Proxmox hostname.
        session: The current validated user session.

    Returns:
        ProxmoxAuth: An authenticated object ready to perform administrative tasks.

    Raises:
        ProxmoxUnauthorizedError: If the user lacks access to the host or token is missing.
        ProxmoxInvalidTokenError: If the token data is incomplete or corrupted.
        ProxmoxConnectionError: If the authentication manager fails to initialize.
    """
    if host not in session["servers"]:
        raise ProxmoxUnauthorizedError(host=host, user=session["user"])
    
    token_data = session["servers"].get(host)
    if not token_data:
        raise ProxmoxUnauthorizedError(host=host, user=session["user"], reason="No token found")
        
    token_id = token_data.get("token_id")
    token_secret = token_data.get("token_secret")
        
    if not token_id or not token_secret:
        raise ProxmoxInvalidTokenError(host=host, token_id=token_id)

    try: 
        return ProxmoxAuth(proxmox_host=f"{host}.usmb-tri.fr",admin_user=admin_user,admin_password=admin_pass,target_user=session["user"])
    
    except Exception as e:
        logging.error(f"Failed to initialize ProxmoxAuth for {host}: {e}")
        raise ProxmoxConnectionError(host=host)


def get_proxmox_manager(host: str,session=Depends(auth.get_current_session)) -> ProxmoxManager:
    """
    Dependency to provide a ProxmoxManager instance for a specific host.
    Useful for node-level operations like listing VMs or checking storage.
    """
    token = get_token_for_host(host, session)
    user = session["user"]
    
    return ProxmoxManager(proxmox_host=f"{host}.usmb-tri.fr",proxmox_user=user,use_token=True, token_name=token["token_name"],token_value=token["token_value"])

   

def get_proxmox_vm(host: str, vmid: int, session=Depends(auth.get_current_session)) -> ProxmoxVM:
    """
    Dependency to provide a ProxmoxVM instance.
    Targets a specific Virtual Machine on a specific host to perform individual actions.
    """
    token = get_token_for_host(host, session)
    user = session["user"]
    return ProxmoxVM(proxmox_host=f"{host}.usmb-tri.fr",proxmox_user=user,use_token=True,token_name=token["token_name"],token_value=token["token_value"],vmid=vmid)
    
def get_proxmox_vm_for_clone(host: str,vm_data: CloneVMRequest,session=Depends(auth.get_current_session)) -> ProxmoxVM:
    """
    Special dependency for VM cloning operations.
    Initializes a ProxmoxVM instance and pre-configures it with the new VM metadata 
    (ID, name, pool, storage) provided in the request body.
    """
    token = get_token_for_host(host, session)
    user = session["user"]

    vm = ProxmoxVM(proxmox_host=f"{host}.usmb-tri.fr",proxmox_user=user,use_token=True,token_name=token["token_name"],token_value=token["token_value"])

    vm.newid = vm_data.newid
    vm.name_vm = vm_data.name
    vm.template_vm = vm_data.template
    vm.pool_vm = vm_data.pool
    vm.storage_vm = vm_data.storage

    return vm


router = APIRouter(tags=["Vms"])



@router.get("/server/{host}/vm")
async def get_vms(host:str,proxmox_manager : ProxmoxManager = Depends(get_proxmox_manager)):
    """
    List all Virtual Machines available on the specified Proxmox host.
    """
    return  proxmox_manager.list_vms()
   
        
    
    
@router.get("/server/{host}/vm/{vmid}")
async def get_vm_status(host:str,vmid: int, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    """
    Retrieve the current power status and QEMU guest agent status for a specific VM.
    """
    
    return {"status": proxmox_vm.status(), "agent_status": proxmox_vm.status_agent()}
  


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
        raise HTTPException(status_code=400, detail=f"Action '{action_data.action}' is not supported.")
    return actions[action_data.action]()

    
    
    
    
   
@router.get("/server/{host}/vm/{vmid}/network")
async def get_vm_network(vmid: int, proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm)):
    """
    Fetch network interface configurations and the primary management IP address of the VM.
    """
    return {"interfaces": proxmox_vm.get_network_interfaces(), "management_ip": proxmox_vm.management_ip()}



@router.post("/server/{host}/vm/clone")
async def clone_vm(proxmox_vm: ProxmoxVM = Depends(get_proxmox_vm_for_clone),proxmox_manager: ProxmoxManager = Depends(get_proxmox_manager)):
    """
    Create a clone of an existing VM.
    If no new VMID is provided, the next available ID on the host will be automatically assigned.
    """
    
    if proxmox_vm.newid is None:
        proxmox_vm.newid = proxmox_manager.get_next_vmid()

    return proxmox_vm.clone_vm()
