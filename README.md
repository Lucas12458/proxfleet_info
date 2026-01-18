# Proxfleet Web API

A web API to manage multiple Proxmox servers in a clusterless configuration.  


## Related Project

This project relies on the Proxfleet project:

- **Proxfleet**: https://github.com/lorne-univ/proxfleet



## Project Description


### Virtual environment

In proxfleet_info directory
```bash
python -m venv venv
```

Windows (PowerShell)
```powershell
.\venv\scripts\activate.ps1
```

Linux / macOS
```bash
source venv/bin/activate
```

Librairies for the projet
```bash
pip install -r requirements.txt
```

## How to use

### Environment Variables Authentication

Create a `.env` file:

**For Password:**
```bash
export PROXMOX_USER=root@pam
export PROXMOX_PASSWORD=myPassword123
```

### Start the FastAPI server using Uvicorn

```bash
uvicorn api.main:app
```
You can change the host and port using the `--host` and `--port` arguments.
```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Start the FastAPI development server using Uvicorn

```bash
uvicorn api.main:app --reload
```
This command reloads the server when a file is updated.


## Development Guidelines

This project follows the [Conventional Commits](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13) specification 

