from proxmoxer import ProxmoxAPI
from proxmoxer.core import ResourceException

import uuid
import time

class ProxmoxAuth:
    def __init__( self,proxmox_host: str,admin_user: str,admin_password: str,target_user: str,verify_ssl: bool = True,):
        """
        Docstring pour __init__
        
        :param self: Description
        :param host: Description
        :param proxmox_user: Description
        :param proxmox_password: Description
        """
        
        self.host = proxmox_host
        self.target_user = target_user
        
        self.proxmox = ProxmoxAPI(proxmox_host, user=admin_user, password=admin_password, verify_ssl=verify_ssl)


    def create_token(self,comment="",privsep:int = 1,ttl_seconds:int = 3600) -> dict:
        """
        Create an API token for the targeted user
            
        :param self: 
        comment : 
        expiration : API token expiration date
        """
            
        tokenid = f"proxfleet-{uuid.uuid4().hex[:12]}"
        expire = int(time.time()) + ttl_seconds
        
        try:
            return self.proxmox.access.users(self.target_user).token(tokenid).post(expire=expire,privsep=privsep,comment=comment)
        
        except ResourceException as e:
            raise RuntimeError(f"Proxmox token creation failed: {e}")

    def delete_token(self,token_id:str) -> None:
        """
        Delete the API token for the targeted user
            
        :param self:
        token_id: The user-specific token identifier.
        """
        return self.proxmox.access.users(self.target_user).token(token_id).delete()

        