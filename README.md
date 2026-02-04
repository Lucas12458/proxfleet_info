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

**This project follows the [Conventional Commits](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13) specification**

## Git - Github

To contribute to the project, follow this simple workflow.
If this is your first time working on the project:
```
git clone https://github.com/Lucas12458/proxfleet_info.git
cd proxfleet_info
```

If you already cloned it before, **make sure to get the latest version**:
```
git checkout main
git pull origin main
```

<ins>Do not work directly on the `main` branch.</ins>
All development must be done in a **separate branch**:
```
git checkout -b feature/<your-feature-name>
```

Edit or add your files as needed. To add a file:
```
git add <filename>
```

Always write a clear and short message using the **conventional commit specification** explaining what was done:
```
git commit -m "<message>"
```

Push your branch to GitHub:
```
git push origin feature/<your-feature-name>
```

Create a Pull Request (PR):
1. Go to the GitHub repository page.  
2. Click **"Pull requests"**.  
3. Add a short but clear description of your changes.  
4. Submit your PR for review.

After the pull request has been approved, delete the local branch:
```
git branch -d feature/<your-feature-name>
```

Delete the remote branch:
```
git push origin --delete feature/<your-feature-name>
```

Switch back to main and update it:
```
git checkout main
git pull origin main
```

### Useful Git Commands

| Command | Description | Example |
|----------|-------------|---------|
| `git status` | Check modified and staged files | `git status` |
| `git fetch origin` | Get latest info from remote | `git fetch origin` |
| `git pull origin main` | Get latest main branch | `git pull origin main` |
| `git diff` | Show unstaged differences | `git diff` |
| `git log` | Show commit history | `git log` |
| `git branch -d <branch>` | Delete a local branch | `git branch -d feature/test-api` |
| `git restore <file>` | Discard local changes | `git restore config.yaml` |