
# Deployment and Operations Guide - Proxfleet

This document details the procedures for installing, configuring, and maintaining the Proxfleet application on a production server.


## 1. Project Retrieval

The project source code is available on GitHub at: <https://github.com/Lucas12458/proxfleet_info>

Option A: Standard Deployment (Recommended)

It is not necessary to clone the entire project onto the production server. Only the `docker-compose.yml` file (retrieved via the deployment script) is required to use the pre-built images from the GitHub Container Registry.

Option B: Local Build (Customization)

If you wish to modify the source code or build the images directly on your server, you must:

- Clone the entire repository onto the server.

- Modify the `docker-compose.yml` file to replace the `image:` directive with a `build:` directive:

```yaml
services:
  backend:
    # Instead of image: ghcr.io/...
    build: 
      context: ./backend
      dockerfile: Dockerfile
    # ... rest of the configuration
  
  frontend:
    # Instead of image: ghcr.io/...
    build:
      context: ./frontend
      dockerfile: Dockerfile

```

<div style="page-break-after: always;"></div>

## 2. Startup and Update Procedure

To automate deployment, it is preferable to use the following shell script:

```bash
#!/bin/bash

# 1. Variable definitions (lowercase names for GHCR)

# Path to the image on GitHub Container Registry (must be lowercase)
export REPO_NAME=lucas12458/proxfleet_info 

# Specific version of the image to pull (latest corresponds to the version on the main branch, dev to the dev branch)
export APP_TAG=latest

# Unique Docker project name to identify associated containers and networks
export PROJECT_ID=proxfleet-prod

# URL root (Base Path) used to access the web interface
export APP_PATH=/app2

# Application configuration mode (production or development)
export ENV=production

# 2. Downloading the docker-compose.yml file from GitHub
curl -o docker-compose.yml https://raw.githubusercontent.com/Lucas12458/proxfleet_info/main/docker-compose.yml

# 3. Downloading new images from GitHub
docker compose -p $PROJECT_ID pull

# 4. Restarting containers (instant update)
docker compose -p $PROJECT_ID up -d
```

Note for Local Build (Option B): If you are building the images yourself, you must:

- Delete the `curl` line (to avoid overwriting your modified `docker-compose.yml`).

- Replace `docker compose pull` with `docker compose build`.

<div style="page-break-after: always;"></div>


## 3. Data and Volume Management

The application uses two persistent volumes to separate the code from user data. Upon the first startup, two folders will be created in the current directory:

Data Volume (`data-${PROJECT_ID}`)
- Usage: Storage of CSV files generated and used by the site.


Configuration Volume (`config-${PROJECT_ID}`)
- `admins.json` : List of accounts with administrative rights on the Proxfleet interface.

- `users_config.json` : List of users with specific privileges.



## 4. Shutdown Procedure

To properly stop all services, use the following script:

```bash
#!/bin/bash

# # 1. Variable definitions

# Unique Docker project name to identify associated containers and networks
export PROJECT_ID=proxfleet-prod

# 2. Running the down command with the project name
docker compose -p $PROJECT_ID down

```

<div style="page-break-after: always;"></div>


## 5. Important Information

User Sessions

- User sessions are stored exclusively in RAM on the backend container.

- Any restart or update of the containers results in a session reset and user disconnection.


Proxmox API Tokens

- The application generates access tokens (API Tokens) to ensure communication with Proxmox servers.

- Token Management: The Proxmox system does not handle the auto-deletion of obsolete tokens.

- Automatic Cleanup: To avoid unnecessary resource accumulation, the application is designed to automatically delete a user's old tokens as soon as they log in to the site again.

- Maintenance: Periodic verification of tokens on the Proxmox interface is recommended to delete obsolete tokens from inactive accounts.s.

Required Privileges
- To display IP addresses, the Proxmox user must have the VM.Monitor privilege (in addition to VM.Audit) on the relevant resources.