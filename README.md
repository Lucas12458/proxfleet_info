# Proxfleet Web API

A web API to manage multiple Proxmox servers in a clusterless configuration.  


## Related Project

This project relies on the Proxfleet project:

- **Proxfleet**: https://github.com/lorne-univ/proxfleet



## API Access

Once the server is running:

- **API base URL**:  
  `http://<host>:<port>/`

- **Interactive API documentation (Swagger UI)**:  
  `http://<host>:<port>/docs`


## Installation & Setup

### 1. Create a virtual environment
From the `proxfleet_info` directory:
```bash
python -m venv venv
```
### 2. Activate the virtual environment
Windows (PowerShell)
```powershell
.\venv\Scripts\activate.ps1
```

Linux / macOS
```bash
source venv/bin/activate
```


### 3. Install dependencies
```bash
pip install -r requirements.txt
```

## Configuration

### Environment Variables (Proxmox authentication)

Create a `.env` file in the project root :

**Use your credentials from the Proxmox servers:**
```bash
export PROXMOX_USER=root@pam
export PROXMOX_PASSWORD=myPassword123
```

## Running the API

### Production-like run

```bash
uvicorn api.main:app
```
You can change the host and port using the `--host` and `--port` arguments.
```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Development mode (auto-reload)

```bash
uvicorn api.main:app --reload
```
This command reloads the API server when a file is updated.


## Development Guidelines

This project follows the [Conventional Commits](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13) specification 

