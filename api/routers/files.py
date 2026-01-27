from proxfleet.proxmox_csv import *

from fastapi import Depends,APIRouter,HTTPException,File,UploadFile
from pydantic import BaseModel
import os
import dotenv
import logging
from pathlib import Path
import shutil
import httpx
import csv
import io


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
    


@router.get("/csv/assignments")
async def get_vm_assignments():
    url = (f"https://docs.google.com/spreadsheets/d/1vht7HaV6jwAwHuT93ZJXDnu7BOzEcsWD/gviz/tq?tqx=out:csv&sheet=Feuille1")

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url)

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch Google Sheet")

    reader = csv.DictReader(io.StringIO(resp.text))

    data = []
    for row in reader:
        if any(v and v.strip() for v in row.values()):
            data.append({
                "promotion": row["Promotion"],
                "nom": row["Nom"],
                "prenom": row["Prenom"],
                "uid": row["uid"],
                "server_id": int(row["Serveur"]),
                "server_name": row["Nom-serveur"],
            })

    return {
        "count": len(data),
        "data": data
    }
