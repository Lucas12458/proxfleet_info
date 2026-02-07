from backend.proxfleet.proxmox_csv import ProxmoxCSV
from fastapi import Depends,APIRouter,HTTPException,UploadFile,File
from pydantic import BaseModel
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
    

logging.basicConfig(level=logging.DEBUG)

UPLOAD_DIR = Path("/tmp/uploads")

ALLOWED_TYPES = {
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def get_proxmox_csv(csv_path: str) -> ProxmoxCSV:
    file_path = Path(csv_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="CSV not found")
    return ProxmoxCSV(csv_path=file_path)



def parse_csv(proxmox_csv: ProxmoxCSV = Depends(get_proxmox_csv)):
    try:
        delimiter = proxmox_csv.detect_delimiter()
        reader = proxmox_csv.read_csv(delimiter=delimiter)

        data = []
        for row in reader:
            if not any(v and v.strip() for v in row.values()):
                continue

            server_id = row.get("Serveur")
            if not server_id or not server_id.isdigit():
                continue

            data.append({
                "promotion": row.get("Promotion"),
                "nom": row.get("Nom"),
                "prenom": row.get("Prenom"),
                "uid": row.get("uid"),
                "server_id": int(server_id),
                "server_name": row.get("Nom-serveur"),
            })

        return {
            "count": len(data),
            "data": data
        }

    except FileNotFoundError:
        raise HTTPException(404, "CSV not found")

    except (UnicodeDecodeError, RuntimeError):
        raise HTTPException(400, "Invalid CSV")

    except Exception:
        logging.exception("Failed to parse CSV")
        raise HTTPException(500, "Unable to read CSV")

    
        
router = APIRouter(tags=["CSV"])

@router.post("/csv/upload",status_code=201)
async def create_upload_csv(csv: UploadFile = File(...)):
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
async def get_assignments(csv_id: str):
    file_path = UPLOAD_DIR / csv_id

    if not file_path.exists():
        raise HTTPException(404, "CSV not found")

    proxmox_csv = ProxmoxCSV(csv_path=file_path)
    return parse_csv(proxmox_csv)


