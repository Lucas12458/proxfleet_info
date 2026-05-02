from proxfleet.proxmox_csv import ProxmoxCSV
from typing import Annotated
from fastapi import Depends, APIRouter, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from api.routers import auth
import os
import dotenv
import logging
from pathlib import Path
import shutil

class CSVWrite(BaseModel):
    rows: list[dict]
    field_names: list[str]

# Constants for SonarQube (S1192)
MSG_CSV_NOT_FOUND = "CSV not found"
MSG_INVALID_CSV = "Invalid CSV"
MSG_UNABLE_TO_READ = "Unable to read CSV"
MSG_UNABLE_TO_CREATE = "Unable to create CSV"
MSG_UNABLE_TO_COPY = "Unable to copy CSV"

dotenv.load_dotenv()

log_level_str = os.getenv("LOG", "INFO").upper()
logging.basicConfig(level=log_level_str)

EXPORT_DIR = Path(os.getenv("EXPORT_DIR", "/app/export"))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/data"))

ALLOWED_TYPES = {
    "text/csv",
    "application/vnd.ms-excel"
}

def get_proxmox_csv(csv_path: str) -> ProxmoxCSV:
    """
    Retrieves a ProxmoxCSV instance securely.
    Extracts only the filename to prevent directory traversal attacks.
    Checks both UPLOAD_DIR and EXPORT_DIR.
    """
    safe_filename = Path(csv_path).name
    
    # 1. On cherche d'abord dans le dossier d'upload classique
    file_path = UPLOAD_DIR / safe_filename
    
    # 2. Si le fichier n'y est pas, on cherche dans le dossier d'export (VMs)
    if not file_path.exists():
        file_path = EXPORT_DIR / safe_filename
        
    # 3. Si le fichier est introuvable dans les deux dossiers, on lève la 404
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=MSG_CSV_NOT_FOUND
        )
        
    return ProxmoxCSV(csv_path=file_path)

def get_latest_csv(upload_dir: Path) -> Path | None:
    """
    Scans the upload directory and returns the path to the most recently modified CSV file.
    Returns None if no CSV files are found.
    """
    csv_files = list(upload_dir.glob("*.csv"))
    
    if not csv_files:
        return None
        
    csv_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return csv_files[0]

def parse_csv(proxmox_csv: ProxmoxCSV) -> dict:
    """
    Internal logic to parse the CSV file.
    Raises standard Python exceptions to be caught by the router.
    """
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


router = APIRouter(tags=["CSV"])

@router.post("/csv/upload", status_code=status.HTTP_201_CREATED)
async def create_upload_csv(
    csv: Annotated[UploadFile, File(...)], 
    session: Annotated[dict, Depends(auth.verify_admin_rights)]
):
    """
    Endpoint to upload a new CSV file.
    Restricted to administrators. Validates file type and prevents path traversal.
    """
    if csv.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, 
            detail="Invalid file type"
        )
        
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        safe_filename = Path(csv.filename).name
        file_path = UPLOAD_DIR / safe_filename

        if file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="CSV file already exists"
            )

        with file_path.open("wb") as buffer:
            shutil.copyfileobj(csv.file, buffer)

        return {"path": str(file_path)}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error while uploading CSV: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to upload CSV"
        )
    

@router.post("/csv/upload-vm", status_code=status.HTTP_201_CREATED)
async def create_upload_vms(
    csv: Annotated[UploadFile, File(...)], 
    session: Annotated[dict, Depends(auth.verify_admin_rights)]
):
    """
    Endpoint to upload a new CSV file.
    Restricted to administrators. Validates file type and prevents path traversal.
    """
    if csv.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, 
            detail="Invalid file type"
        )
        
    try:
        safe_filename = Path(csv.filename).name
        file_path = EXPORT_DIR / safe_filename

        if file_path.exists():
             raise HTTPException(status_code=409, detail="Le fichier existe déjà")

        with file_path.open("wb") as buffer:
            shutil.copyfileobj(csv.file, buffer)

        # MODIFICATION ICI : On renvoie 'filename' pour correspondre au frontend
        return {"filename": safe_filename}
        
    except Exception as e:
        logging.error(f"Erreur upload : {str(e)}")
        raise HTTPException(status_code=500, detail="Impossible d'uploader le CSV")

@router.get("/csv/read")
async def read_csv(proxmox_csv: Annotated[ProxmoxCSV, Depends(get_proxmox_csv)]):
    try:
        delimiter = proxmox_csv.detect_delimiter()
        return proxmox_csv.read_csv(delimiter=delimiter)
    except RuntimeError as e:
        logging.error(f"Failed to read CSV: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=MSG_UNABLE_TO_READ
        )

@router.post("/csv/create", status_code=status.HTTP_201_CREATED)
async def create_csv(csv_name: str):
    """
    Creates a new CSV file.
    Does NOT use get_proxmox_csv to avoid premature 404 errors.
    """
    safe_filename = Path(csv_name).name
    file_path = UPLOAD_DIR / safe_filename
    proxmox_csv = ProxmoxCSV(csv_path=file_path)

    try:
        return proxmox_csv.create_csv()
    except FileExistsError:
        logging.error(f"File {safe_filename} already exists")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File already exists"
        )
    except RuntimeError as e:
        logging.error(f"Failed to create CSV: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=MSG_UNABLE_TO_CREATE
        )

@router.delete("/csv/delete")
async def delete_csv(proxmox_csv: Annotated[ProxmoxCSV, Depends(get_proxmox_csv)]):
    try:
        return proxmox_csv.delete_csv()
    except Exception as e:
        logging.error(f"Failed to delete CSV: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete CSV"
        )

@router.post("/csv/copy")
async def copy_csv(
    proxmox_csv: Annotated[ProxmoxCSV, Depends(get_proxmox_csv)], 
    csv_name: str | None = None
):
    try:
        return proxmox_csv.copy_csv(new_name=csv_name)
    except RuntimeError as e:
        logging.error(f"Failed to copy CSV: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=MSG_UNABLE_TO_COPY
        )

@router.get("/csv/count")
async def count_rows(proxmox_csv: Annotated[ProxmoxCSV, Depends(get_proxmox_csv)]):
    try:
        delimiter = proxmox_csv.detect_delimiter()
        return proxmox_csv.count_rows(delimiter=delimiter)
    except Exception as e:
        logging.error(f"Failed to count rows: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to count rows"
        )

@router.get("/csv/header")
async def read_header(proxmox_csv: Annotated[ProxmoxCSV, Depends(get_proxmox_csv)]):
    try:
        delimiter = proxmox_csv.detect_delimiter()
        return proxmox_csv.read_header(delimiter=delimiter)
    except RuntimeError as e:
        logging.error(f"Failed to read CSV headers: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=MSG_UNABLE_TO_READ
        )

@router.post("/csv/write")
async def write_csv(
    csv_data: CSVWrite, 
    proxmox_csv: Annotated[ProxmoxCSV, Depends(get_proxmox_csv)]
):
    try:
        delimiter = proxmox_csv.detect_delimiter()
        return proxmox_csv.write_csv(
            rows=csv_data.rows, 
            fieldnames=csv_data.field_names, 
            delimiter=delimiter
        )
    except Exception as e:
        logging.error(f"Failed to write CSV: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to write to CSV"
        )

@router.get(
    "/csv/assignments",
    responses={
        status.HTTP_404_NOT_FOUND: {"description": MSG_CSV_NOT_FOUND},
        status.HTTP_400_BAD_REQUEST: {"description": MSG_INVALID_CSV},
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"description": MSG_UNABLE_TO_READ},
    }
)
async def get_assignments(proxmox_csv: Annotated[ProxmoxCSV, Depends(get_proxmox_csv)]):
    """
    Parses the CSV file and returns formatted assignments.
    Secured against path traversal by using get_proxmox_csv.
    """
    try:
        return parse_csv(proxmox_csv)
    except (UnicodeDecodeError, RuntimeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=MSG_INVALID_CSV
        )
    except Exception as e:
        logging.exception(f"Failed to parse CSV: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=MSG_UNABLE_TO_READ
        )

@router.get("/csv/filenames")
async def list_csv_files():
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        files = [f.name for f in UPLOAD_DIR.iterdir() if f.is_file() and f.suffix == ".csv"]
        return {"filenames": files}
    except Exception as e:
        logging.error(f"Failed to list CSV files: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Unable to list files"
        )
    
@router.get("/csv/VMsFilenames")
async def list_vms_files():
    try:
        EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        files = [f.name for f in EXPORT_DIR.iterdir() if f.is_file() and f.suffix == ".csv"]
        return {"filenames": files}
    except Exception as e:
        logging.error(f"Failed to list CSV files: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Unable to list files"
        )