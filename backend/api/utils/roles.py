import os
import json
import aiofiles

ADMINS_FILE_PATH = "/app/config/admins.json"

async def add_admin_user(userid: str) -> None:
    """
    Reads the admins.json file and appends the userid if it is not already present.
    Raises standard Python exceptions (ValueError, RuntimeError).
    """
    admins_list = []
    
    if os.path.exists(ADMINS_FILE_PATH):
        try:
            async with aiofiles.open(ADMINS_FILE_PATH, mode='r') as f:
                content = await f.read()
                if content.strip():
                    admins_list = json.loads(content)
        except json.JSONDecodeError:
            raise ValueError(f"The file {ADMINS_FILE_PATH} contains invalid JSON.")
        except Exception as e:
            raise RuntimeError(f"Could not read admin configuration: {str(e)}")

    if userid not in admins_list:
        admins_list.append(userid)
        
        try:
            os.makedirs(os.path.dirname(ADMINS_FILE_PATH), exist_ok=True)
            async with aiofiles.open(ADMINS_FILE_PATH, mode='w') as f:
                await f.write(json.dumps(admins_list, indent=4))
        except Exception as e:
            raise RuntimeError(f"Could not write to admin configuration: {str(e)}")