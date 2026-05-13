from proxfleet.proxmox_manager import ProxmoxManager
from proxfleet.proxmox_vm import ProxmoxVM
from proxfleet.proxmox_authentication import ProxmoxAuth
from proxfleet.bulk_vm_management import clone_csv
from api.routers import auth
from api.state import clone_jobs
from api.exceptions.exceptions import (
    ProxmoxUnauthorizedError,
    ProxmoxInvalidTokenError,
    ProxmoxConnectionError,
    ProxmoxAPIError,
    ProxmoxResourceNotFoundError
)
from fastapi import Depends, APIRouter, HTTPException,status,BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel,Field
from pathlib import Path
from typing import Annotated,Dict,Any,Optional

import uuid
import os
import dotenv
import logging

dotenv.load_dotenv()

log_level_str = os.getenv("LOG", "INFO").upper()
logging.basicConfig(level=log_level_str)

EXPORT_DIR = Path(os.getenv("EXPORT_DIR", "/app/export"))
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# path to the yaml file
CONFIG_PATH = BASE_DIR / "config.yaml" 



class VMAction(BaseModel):
    action: str  # start, stop, shutdown, reboot, delete

class CloneVMRequest(BaseModel):
    newid: int |None = Field(default=None, gt=0)
    name: str
    template : int
    pool: str
    storage: str 

class NetworkUpdateSchema(BaseModel):
    bridge: str
    tag: Optional[int] = None



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

    
    
    try:
        manager = get_proxmox_manager(host=host, session=session)
        return ProxmoxVM(manager=manager, vmid=vmid)
    except Exception:
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


def background_clone_task(job_id, file_path, config_path, user, all_tokens):
    with open(file_path, 'r') as f:
        total_vms = sum(1 for _ in f) - 1
    
    clone_jobs[job_id] = {"status": "running", "current": 0, "total": total_vms}
    
    try:
        clone_csv(
            input_csv=file_path,
            config_yaml=config_path,
            proxmox_user=user,
            tokens_dict=all_tokens,
            job_id=job_id
        )
        clone_jobs[job_id]["status"] = "completed"
    except Exception:
        clone_jobs[job_id]["status"] = "error"



router = APIRouter(tags=["Vms"])



@router.get("/server/{host}/vm")
async def get_vms(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)],host: str):
    """
    List all Virtual Machines available on the specified Proxmox host.
    """
    try:
        return proxmox_manager.list_vms()
    except Exception as e:
        raise ProxmoxAPIError(f"Failed to list VMs on host {host}: {str(e)}")
        
    
    
@router.get("/server/{host}/vm/{vmid}")
async def get_vm_status(host: str, vmid: int, proxmox_vm: Annotated[ProxmoxVM,Depends(get_proxmox_vm)]):
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
async def vm_action(vmid: int, action_data: VMAction, proxmox_vm: Annotated[ProxmoxVM,Depends(get_proxmox_vm)]):
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

    
@router.get(
    "/server/{host}/vm/{vmid}/network",
    responses={
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permissions"},
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"description": "Unexpected Proxmox API error"}
    }
)
async def get_vm_network(
    host: str, 
    vmid: int, 
    proxmox_vm: Annotated[ProxmoxVM, Depends(get_proxmox_vm)]
):
    """
    Fetch network interface configurations and the primary management IP address of the VM.
    Gracefully handles QEMU agent states and missing IPs for frontend polling.
    """
    # 1. ALWAYS fetch interfaces first (Works even if VM is powered off)
    interfaces = proxmox_vm.get_network_interfaces()
    
    try:
        # 2. Try to fetch IP (Will throw exception if VM is stopped or agent is down)
        management_ip = proxmox_vm.management_ip()
        
        return {
            "interfaces": interfaces, 
            "management_ip": management_ip,
            "agent_status": "ok"
        }
        
    except Exception as e:
        error_msg = str(e).lower()
        logging.error(f"Network fetch error for VM {vmid} on {host}: {error_msg}")
        
        # 1. Authorization errors (Strict enforcement)
        if "403" in error_msg or "permission check failed" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions (VM.Monitor) for VM {vmid}"
            )
            
        # For all following cases, WE MUST INCLUDE the 'interfaces' variable 
        # so the React modal can still display them!
            
        # 2. QEMU Agent not configured in hardware
        elif "not configured" in error_msg:
            return {
                "interfaces": interfaces,
                "management_ip": None, 
                "agent_status": "not_configured"
            }
            
        # 3. VM is stopped, booting, or agent service not started yet
        elif "not running" in error_msg or "agent" in error_msg or "500" in error_msg or "qga" in error_msg:
            return {
                "interfaces": interfaces,
                "management_ip": None, 
                "agent_status": "booting_or_stopped"
            }

        # 4. Agent is running but hasn't received an IP from DHCP yet
        elif "no management ip found" in error_msg:
            return {
                "interfaces": interfaces,
                "management_ip": None, 
                "agent_status": "no_ip_detected"
            }
            
        # 5. Unknown/Critical errors (Still return interfaces to allow editing)
        else:
            return {
                "interfaces": interfaces,
                "management_ip": None,
                "agent_status": "error_unknown"
            }

@router.put(
    "/server/{host}/vm/{vmid}/network/{net_name}",
    responses={
        status.HTTP_200_OK: {"description": "Interface updated"},
        status.HTTP_404_NOT_FOUND: {"description": "Interface not found"},
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"description": "Update failed"}
    }
)
async def api_update_vm_network(
    host: str, 
    vmid: int, 
    net_name: str, 
    data: NetworkUpdateSchema,
    proxmox_vm: Annotated[ProxmoxVM, Depends(get_proxmox_vm)]
):
    """
    Update a specific network interface bridge or VLAN tag.
    """
    success = proxmox_vm.update_network_interface(net_name, bridge=data.bridge, tag=data.tag)
    
    if not success:
        # Check if it was a 404 (interface missing) or a 500 (API error)
        config = proxmox_vm.manager.proxmox.nodes(proxmox_vm.node).qemu(vmid).config.get()
        if net_name not in config:
            raise HTTPException(status_code=404, detail="Interface not found")
        raise HTTPException(status_code=500, detail="Failed to update interface")
        
    return {"message": f"Interface {net_name} updated on VM {vmid}"}
        
@router.post("/server/{host}/vm/clone")
async def clone_vm(host: str, request_data: CloneVMRequest,proxmox_manager: Annotated[ProxmoxManager, Depends(get_proxmox_manager)]):
    """
    Create a clone of an existing VM using parameters from the request body.
    Automatically assigns the next available ID if none is provided.
    """
    
    
    proxmox_vm = ProxmoxVM(manager=proxmox_manager, vmid=request_data.template)
    
    # Assign the new parameters requested by the user
    proxmox_vm.newid = request_data.newid
    proxmox_vm.name_vm = request_data.name
    proxmox_vm.pool_vm = request_data.pool
    proxmox_vm.storage_vm = request_data.storage
    proxmox_vm.template_vm = request_data.template

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
        logging.info(f"Cloning template {request_data.template} to new ID {proxmox_vm.newid} on {host}...")
        
        
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
                 resource_id=str(request_data.template), 
                 host=host
             )
        
        raise ProxmoxAPIError(f"Cloning failed: {error_msg}")
    
@router.post("/vm/clone-csv",
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid path (Path Traversal)"},
        status.HTTP_404_NOT_FOUND: {"description": "CSV file not found"},
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"description": "Internal error while starting the clone process"}
    }
)
async def clone_csv_endpoint(csv_name: str, background_tasks: BackgroundTasks,session: Annotated[dict, Depends(auth.verify_admin_rights)]):
    try:
        # Secure path resolution
        file_path = (EXPORT_DIR / csv_name).resolve()
        if not str(file_path).startswith(str(EXPORT_DIR.resolve())):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path")
            
        if not file_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CSV file not found")

        # Retrieve tokens from all servers for Bulk mode
        user = session.get("user")
        all_tokens = session.get("servers", {}) 

        job_id = str(uuid.uuid4())

        clone_jobs[job_id] = {
            "status": "starting",
            "current": 0, 
            "total": 0
        }   

        # Launch the background task
        background_tasks.add_task(
            background_clone_task,
            job_id=job_id,
            file_path=str(file_path),
            config_path=str(CONFIG_PATH),
            user=user,
            all_tokens=all_tokens 
        )
        
        return {"job_id": job_id, "status": "started"}

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error starting clone task: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    
@router.get("/vm/clone-csv/status/{job_id}")
async def get_clone_status(
    job_id: str, 
    session: Annotated[dict, Depends(auth.get_current_session)]
):
    """
    Endpoint for the frontend to poll the status of a cloning job.
    """
    if job_id not in clone_jobs:
       logging.debug(f"Job {job_id} introuvable dans {clone_jobs.keys()}")
       raise ProxmoxResourceNotFoundError(resource_type="Job", resource_id=job_id, host="local")
    
    return clone_jobs[job_id]