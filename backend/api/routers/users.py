from proxfleet.proxmox_manager import ProxmoxManager
from proxfleet.proxmox_etu import ProxmoxEtu
from api.routers import auth
from fastapi import Depends,APIRouter,HTTPException
from pydantic import BaseModel
import os
import dotenv
import logging



dotenv.load_dotenv()
logging.basicConfig(level=logging.DEBUG)


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