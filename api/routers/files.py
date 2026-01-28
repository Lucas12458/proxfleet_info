from proxfleet.proxmox_csv import *

from fastapi import Depends,APIRouter,HTTPException,File,UploadFile
from pydantic import BaseModel,Field
import os
import dotenv
import logging
from pathlib import Path
import shutil
import httpx
import csv
import io


class CSVWrite(BaseModel):
    rows : list[dict]
    field_names : list[str]
    


dotenv.load_dotenv()
logging.basicConfig(level=logging.DEBUG)

UPLOAD_DIR = Path("/tmp/uploads")

ALLOWED_TYPES = {
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def get_proxmox_csv(csv_path: str) -> ProxmoxCSV:
    
    return ProxmoxCSV(csv_path=csv_path)
    
        
router = APIRouter(tags=["CSV"])
proxmox_user = os.getenv("PROXMOX_USER")
proxmox_pass = os.getenv("PROXMOX_PASSWORD")

@router.post("/csv/upload",status_code=201)
async def create_upload_csv(csv: UploadFile):
    if csv.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Invalid file type")
    else:
        try:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

            file_path = UPLOAD_DIR / csv.filename

            if file_path.exists():
                raise HTTPException(status_code=409,detail="CSV file already exists")

            with file_path.open("wb") as buffer:
                shutil.copyfileobj(csv.file, buffer)
    
            return {"path": str(file_path)}
        
        except HTTPException:
            raise

        except Exception as e:
            logging.error("Error while uploading CSV")
            raise HTTPException(status_code=500,detail="Unable to upload CSV")

    
@router.get("/csv/read")
async def read_csv(proxmox_csv:ProxmoxCSV = Depends(get_proxmox_csv)):
   try:
    delimiter = proxmox_csv.detect_delimiter()
    return proxmox_csv.read_csv(delimiter=delimiter)
   
   except FileNotFoundError:
       logging.error("File not found")
       raise HTTPException(status_code=404,detail="CSV not found")
    
   except RuntimeError:
       logging.error("Failed to read CSV")
       raise HTTPException(status_code=500,detail="Unable to read csv")
       



@router.post("/csv/create")
async def create_csv(proxmox_csv:ProxmoxCSV = Depends(get_proxmox_csv)):
    try:
        return proxmox_csv.create_csv()
    except FileExistsError:
        logging.error("File already exists")
        raise HTTPException(status_code=409,detail="File already exists")
    except RuntimeError:
        logging.error(f"Failed to create CSV")
        raise HTTPException(status_code=500,detail="Unable to create CSV")
    
@router.delete("/csv/delete")
async def delete_csv(proxmox_csv:ProxmoxCSV = Depends(get_proxmox_csv)):
    try:
        return proxmox_csv.delete_csv()
    except FileNotFoundError:
        logging.error("File not found")
        raise HTTPException(status_code=404,detail="CSV not found")
    
    except Exception as e:
        logging.error("Failed to delete CSV")
        raise HTTPException(status_code=500,detail="Unable to delete CSV")

@router.post("/csv/copy")
async def copy_csv(csv_name:str |None = None,proxmox_csv:ProxmoxCSV = Depends(get_proxmox_csv)):
    try:

        return proxmox_csv.copy_csv(new_name=csv_name)
    except FileNotFoundError:
        logging.error("File not found")
        raise HTTPException(status_code=404,detail="CSV not found")
    except RuntimeError:
        logging.error("Failed to copy CSV")
        raise HTTPException(status_code=500,detail="Unable to copy CSV")
    
@router.get("/csv/count")
async def count_rows(proxmox_csv:ProxmoxCSV = Depends(get_proxmox_csv)):
    delimiter = proxmox_csv.detect_delimiter()
    return proxmox_csv.count_rows(delimiter=delimiter)

@router.get("/csv/header")
async def read_header(proxmox_csv:ProxmoxCSV = Depends(get_proxmox_csv)):
    try:
        delimiter = proxmox_csv.detect_delimiter()
        return proxmox_csv.read_header(delimiter=delimiter)
    except FileNotFoundError:
        logging.error("File not found")
        raise HTTPException(status_code=404,detail="CSV not found")
    except RuntimeError:
        logging.error("Failed to read CSV")
        raise HTTPException(status_code=500,detail="Unable to read CSV headers")


@router.post("/csv/write")
async def write_csv(csv_data:CSVWrite,proxmox_csv:ProxmoxCSV = Depends(get_proxmox_csv)):
    delimiter = proxmox_csv.detect_delimiter()
    return proxmox_csv.write_csv(rows=csv_data.rows,fieldnames=csv_data.field_names,delimiter=delimiter)





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
