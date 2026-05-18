from proxfleet.proxmox_manager import ProxmoxManager
from proxfleet.proxmox_etu import ProxmoxEtu
from typing import Annotated
from api.routers import auth
from api.utils.roles import get_user_permissions,update_user_permissions,remove_admin_user,add_admin_user,UserPermissions,UserPermissionsUpdate
from fastapi import Depends,APIRouter,HTTPException,status
from api.exceptions.exceptions import AdminConfigurationError,PermissionsError

from pydantic import BaseModel
import os
import dotenv
import logging



dotenv.load_dotenv()

log_level_str = os.getenv("LOG", "INFO").upper()
logging.basicConfig(level=log_level_str)


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
async def get_users(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)]):
    return proxmox_manager.list_users()

@router.post("/server/{host}/user/")
async def create_user(userid:str,user_data:UserCreate,proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)]):
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
async def add_user_to_group(group:str,userid:str,proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)]):
   return proxmox_manager.add_user_to_group(userid,group)

@router.delete("/server/{host}")
async def delete_usmb_users(proxmox_manager:Annotated[ProxmoxManager,Depends(get_proxmox_manager)]):
    return proxmox_manager.delete_usmb_users()

@router.get("/user/{userid}/permissions",
            responses={
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"description": "Business logic error while reading permissions"}
    })
async def api_get_permissions(userid: str,session:Annotated[dict,Depends(auth.get_current_session)]):
    """
    Retrieves the application-level permissions for a specific user.

    Args:
        userid (str): The unique identifier of the user.

    Returns:
        dict: A dictionary containing the user's permissions (e.g., can_modify_csv).

    Raises:
        HTTPException: If there is an underlying business logic error reading the permissions.
    """
    try:
        return await get_user_permissions(userid)
    except PermissionsError as e:
        # Translate the business logic error into an HTTP error
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.put("/user/{userid}/permissions",
            responses={
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"description": "Business logic error while updating permissions"}
    })
async def api_update_permissions(
    userid: str, 
    data: UserPermissionsUpdate,
    session: Annotated[dict,Depends(auth.verify_admin_rights) ]   
):
    """
    Main entry point to update user rights. 
    Routes admin status to admins.json and functional rights to users_config.json.
    """
    try:
        # 1. Handle Global Admin Status (admins.json)
        if data.is_admin:
            await add_admin_user(userid)
        else:
            await remove_admin_user(userid)

        # 2. Handle Functional Permissions (users_config.json)
        # We extract only the functional fields for the config file
        functional_perms = UserPermissions(
            can_modify_csv=data.can_modify_csv,
            can_bulk_clone=data.can_bulk_clone,
            can_export_vms=data.can_export_vms
        )
        await update_user_permissions(userid, functional_perms)

        return {"message": f"All privileges updated successfully for {userid}"}

    except PermissionsError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))