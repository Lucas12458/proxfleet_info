import os
import json
import aiofiles
from pydantic import BaseModel
from api.exceptions.exceptions import PermissionsError,PermissionsReadError,PermissionsWriteError

ADMINS_FILE_PATH = "/app/config/admins.json"
USERS_PERMISSIONS_FILE = "/app/config/users_config.json" 

class UserPermissions(BaseModel):
    can_modify_csv: bool
    can_bulk_clone: bool
    can_export_vms: bool
    
class UserPermissionsUpdate(BaseModel):
    """Ce qui arrive de la modale React (Métier + Admin)"""
    can_modify_csv: bool
    can_bulk_clone: bool
    can_export_vms: bool
    is_admin: bool


async def add_admin_user(userid: str) -> None:
    """
    Reads the admins configuration file and appends the userid if it is not already present.

    Args:
        userid (str): The unique identifier of the user to promote to admin.

    Raises:
        PermissionsReadError: If the file exists but contains invalid JSON or cannot be read.
        PermissionsWriteError: If the file cannot be created or written to.
    """
    admins_list = []
    
    if os.path.exists(ADMINS_FILE_PATH):
        try:
            async with aiofiles.open(ADMINS_FILE_PATH, mode='r') as f:
                content = await f.read()
                if content.strip():
                    admins_list = json.loads(content)
        except json.JSONDecodeError as e:
            # Replaced ValueError with your custom business exception
            raise PermissionsReadError(f"Invalid JSON in admin configuration: {str(e)}")
        except Exception as e:
            # Replaced RuntimeError with your custom business exception
            raise PermissionsReadError(f"Could not read admin configuration: {str(e)}")

    if userid not in admins_list:
        admins_list.append(userid)
        
        try:
            dir_name = os.path.dirname(ADMINS_FILE_PATH)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
                
            async with aiofiles.open(ADMINS_FILE_PATH, mode='w') as f:
                await f.write(json.dumps(admins_list, indent=4))
        except Exception as e:
            # Replaced RuntimeError with your custom business exception
            raise PermissionsWriteError(f"Could not write to admin configuration: {str(e)}")


async def read_permissions() -> dict:
    if not os.path.exists(USERS_PERMISSIONS_FILE):
        return {}
    try:
        async with aiofiles.open(USERS_PERMISSIONS_FILE, mode='r') as f:
            content = await f.read()
            if content.strip():
                return json.loads(content)
            return {}
    except json.JSONDecodeError as e:
        raise PermissionsReadError(f"Invalid JSON format in config: {str(e)}")
    except Exception as e:
        raise PermissionsReadError(f"System error reading config: {str(e)}")

async def write_permissions(data: dict) -> None:
    try:
        dir_name = os.path.dirname(USERS_PERMISSIONS_FILE)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
            
        async with aiofiles.open(USERS_PERMISSIONS_FILE, mode='w') as f:
            await f.write(json.dumps(data, indent=4))
    except Exception as e:
        raise PermissionsWriteError(f"System error writing config: {str(e)}")

async def get_user_permissions(userid: str) -> dict:
    """
    Retrieves consolidated privileges for a user by checking both 
    admins.json and users_config.json.
    """
    # 1. Check if the user is a Global Admin (admins.json)
    is_admin = False
    if os.path.exists(ADMINS_FILE_PATH):
        try:
            async with aiofiles.open(ADMINS_FILE_PATH, mode='r') as f:
                content = await f.read()
                if content.strip():
                    admins_list = json.loads(content)
                    # Check if userid (e.g., 'projetinfo2@pam') or just username is in list
                    # To be safe, we check both or adapt to your admins.json format
                    is_admin = userid in admins_list or userid.split('@')[0] in admins_list
        except Exception as e:
            print(f"Error reading admins.json: {e}")

    # 2. Get functional permissions (users_config.json)
    defaults = {
        "can_modify_csv": False,
        "can_bulk_clone": False,
        "can_export_vms": False
    }
    
    try:
        data = await read_permissions()
        user_data = data.get(userid, {})
    except Exception:
        user_data = {}

    # 3. Consolidate and return
    return {
        **defaults, 
        **user_data, 
        "is_admin": is_admin
    }
async def update_user_permissions(userid: str, perms: UserPermissions) -> None:
    """
    Updates and saves the privileges for a specified user.

    Args:
        userid (str): The unique identifier of the user.
        perms (UserPermissions): The Pydantic model containing the new permission states.
        
    Raises:
        PermissionsReadError: If the underlying configuration file cannot be read.
        PermissionsWriteError: If the underlying configuration file cannot be written.
    """
    # Fetch existing data to avoid overwriting other users' permissions
    data = await read_permissions()
    
    # Convert the Pydantic model to a dictionary and update the specific user
    data[userid] = perms.model_dump()
    
    # Persist the changes to the disk
    await write_permissions(data)


async def remove_admin_user(userid: str) -> None:
    """
    Removes the userid from the admins.json file if present.
    
    Args:
        userid (str): The unique identifier of the user to demote.
    """
    if not os.path.exists(ADMINS_FILE_PATH):
        return

    try:
        async with aiofiles.open(ADMINS_FILE_PATH, mode='r') as f:
            content = await f.read()
            admins_list = json.loads(content) if content.strip() else []
            
        if userid in admins_list:
            admins_list.remove(userid)
            async with aiofiles.open(ADMINS_FILE_PATH, mode='w') as f:
                await f.write(json.dumps(admins_list, indent=4))
    except Exception as e:
        raise PermissionsWriteError(f"Failed to remove admin rights: {str(e)}")