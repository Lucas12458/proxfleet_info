from proxfleet.proxmox_csv import *

from fastapi import Depends,APIRouter,HTTPException,File,UploadFile
from pydantic import BaseModel
import os
import dotenv
import logging
from pathlib import Path
import shutil

dotenv.load_dotenv()
logging.basicConfig(level=logging.DEBUG)

UPLOAD_DIR = Path("/tmp/uploads")

ALLOWED_TYPES = {
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def get_proxmox_csv(csv_path: str) -> ProxmoxCSV:
    try:
        return ProxmoxCSV(csv_path=csv_path)
    except Exception as e:
        logging.error(f"Failed: {e}")
        raise HTTPException(status_code=500,detail=f"Unable")




router = APIRouter(tags=["CSV"])
proxmox_user = os.getenv("PROXMOX_USER")
proxmox_pass = os.getenv("PROXMOX_PASSWORD")

@router.post("/csv/upload")
async def create_upload_csv(csv: UploadFile):
    if csv.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Invalid file type")
    else:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        file_path = UPLOAD_DIR / csv.filename

   
   
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(csv.file, buffer)
    
        return {"path": str(file_path)}

    
@router.get("/csv/read")
async def read_csv(proxmox_csv:ProxmoxCSV = Depends(get_proxmox_csv)):
   delimiter = proxmox_csv.detect_delimiter()
   return proxmox_csv.read_csv(delimiter=delimiter)
    

