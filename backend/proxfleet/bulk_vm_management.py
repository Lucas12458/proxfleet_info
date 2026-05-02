import asyncio
import logging
import time
import yaml
from api.state import clone_jobs
from proxfleet.proxmox_manager import ProxmoxManager
from proxfleet.proxmox_vm import ProxmoxVM
from proxfleet.proxmox_csv import ProxmoxCSV



def load_csv_and_connections(csv_path: str, config_yaml: str, proxmox_user: str, tokens_dict: dict = None):
    # 1. Load CSV data
    logging.debug(f"[LOAD] Loading CSV file: {csv_path}")
    csv_handler = ProxmoxCSV(csv_path)
    delimiter = csv_handler.detect_delimiter()
    rows = csv_handler.read_csv(delimiter)
    if not rows:
        logging.error("CSV file is empty or unreadable.")
        return None, None, None, None

    # 2. Load YAML configuration
    logging.debug(f"[LOAD] Loading configuration file: {config_yaml}")
    try:
        with open(config_yaml, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
            servers = config.get("servers", [])
    except Exception as e:
        logging.error(f"Unable to load YAML config '{config_yaml}': {e}")
        return None, None, None, None

    # 3. Prepare Proxmox connections
    logging.debug("[LOAD] Preparing Proxmox connections.")
    connections = {"user": proxmox_user}
    unique_hosts = set(row["target_host"] for row in rows if row.get("target_host"))

    for target_host in unique_hosts:
        server_entry = next((s for s in servers if s.get("host") == target_host), None)
        if not server_entry:
            logging.error(f"Server '{target_host}' not found in configuration.")
            continue
            
        proxmox_host = server_entry.get("usmb-tri")
        
        token_info = tokens_dict.get(target_host, {}) if tokens_dict else {}
        
        t_name = token_info.get("tokenid")
        t_value = token_info.get("value")
        

        if not t_name or not t_value:
            logging.error(f"No token found for host {target_host} in session.")
            continue

        try:
            logging.debug(f"Connecting to {target_host} ({proxmox_host}) with token {t_name}")
            manager = ProxmoxManager(
                proxmox_host=proxmox_host, 
                proxmox_user=proxmox_user, 
                use_token=True, 
                token_name=t_name, 
                token_value=t_value
            )
            connections[target_host] = {"manager": manager, "proxmox_host": proxmox_host}
        except Exception as e:
            logging.error(f"Failed to connect to {target_host}: {e}")

    return csv_handler, delimiter, rows, connections

def check_csv(input_csv: str, config_yaml: str,proxmox_user: str, tokens_dict: dict = None):
    """
    Validate the content of a CSV file (before cloning VMs).
    input_csv: file path (csv file)
    config_yaml: file path (proxmox server hostname)
    proxmox_user: user@pam // admin: 'root@pam'
    proxmox_password: password (optional if use_token=True)
    use_token: if True, use token authentication
    token_name: API token name (required if use_token=True)
    token_value: API token value (required if use_token=True)
    return: tuple[bool, list[dict]] â†’ if OK (True, []), else (False, [{"line": X, "errors": [list of failed fields]}])
    """
    logging.debug(f"Starting CSV validation for file: {input_csv}")

    # 1. Load the configuration file (YAML)
    logging.debug(f"[STEP 1] Loading configuration file: {config_yaml}")
    try:
        with open(config_yaml, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
            servers = config.get("servers", [])
        logging.debug(f"Config loaded successfully with {len(servers)} Proxmox servers.")
    except Exception as e:
        logging.error(f"Unable to load YAML config '{config_yaml}': {e}")
        return False, [{"line": 0, "errors": ["config_yaml"]}]

    # 2. Read and parse the CSV file
    logging.debug(f"[STEP 2] Opening and reading CSV file: {input_csv}")
    csv_handler = ProxmoxCSV(input_csv)
    delimiter = csv_handler.detect_delimiter()
    logging.debug(f"Detected delimiter: '{delimiter}'")

    header = csv_handler.read_header(delimiter)
    logging.debug(f"Detected header: {header}")

    expected_columns = ["student_name","student_firstname","student_login","target_host","vm_name","template_name","pool","storage","newid","net0","net1","ipv4","status"]
    if header != expected_columns:
        logging.error(f"Invalid CSV header. Expected: {expected_columns}, Found: {header}")
        return False, [{"line": 0, "errors": ["header"]}]

    rows = csv_handler.read_csv(delimiter)
    if not rows:
        logging.error("CSV is empty or unreadable.")
        return False, [{"line": 0, "errors": ["empty_csv"]}]

    # 3. Prepare Proxmox connections per target host
    logging.debug("[STEP 3] Preparing Proxmox connections per target host.")
    connections = {}
    errors = []

    # 4. Validate each CSV line
    logging.debug("[STEP 4] Starting per-line validation.")
    for i, row in enumerate(rows, start=2):
        logging.debug(f"Validating CSV line {i}: {row}")
        line_errors = []
        target_host = (row.get("target_host") or "").strip()
       

        if not target_host:
            line_errors.append("target_host_missing")
        else:
            if target_host not in connections:
                server_entry = next((s for s in servers if s.get("host") == target_host), None)
                if not server_entry:
                    line_errors.append("target_host_not_in_config")
                else:
                    proxmox_host = server_entry.get("usmb-tri")
                    
                    token_info = tokens_dict.get(target_host, {}) if tokens_dict else {}
                    t_name = token_info.get("token_name")
                    t_value = token_info.get("token_value")

                    if not t_name or not t_value:
                        line_errors.append("missing_token")
                    else:
                        try:
                            manager = ProxmoxManager(proxmox_host=proxmox_host, proxmox_user=proxmox_user, use_token=True, token_name=t_name, token_value=t_value)
                            vm_helper = ProxmoxVM(proxmox_host=proxmox_host, proxmox_user=proxmox_user, vmid=0, use_token=True, token_name=t_name, token_value=t_value)
                            connections[target_host] = {"manager": manager, "vm": vm_helper}
                        except Exception as e:
                            logging.error(f"Connection failed to {target_host}: {e}")
                            line_errors.append("connection_failed")

        if line_errors:
            errors.append({"line": i, "errors": line_errors})
            continue

        

        manager = connections[target_host]["manager"]
        vm_helper = connections[target_host]["vm"]

        template_name = (row.get("template_name") or "").strip()
        if not template_name:
            line_errors.append("template_name")
        else:
            found, _ = vm_helper.search_name(template_name, template=True)
            if not found:
                line_errors.append("template_name")

        pool = (row.get("pool") or "").strip()
        if not pool or not manager.check_pool_exists(pool):
            line_errors.append("pool")

        storage = (row.get("storage") or "").strip()
        if storage and not manager.check_storage_exists(storage):
            line_errors.append("storage")

        newid = (row.get("newid") or "").strip()
        if newid:
            try:
                newid_int = int(newid)
                exists, _ = vm_helper.search_vmid(newid_int)
                if exists:
                    line_errors.append("newid_conflict")
            except ValueError:
                line_errors.append("newid_invalid")

        for net_key in [k for k in row.keys() if k.startswith("net")]:
            bridge = (row.get(net_key) or "").strip()
            if bridge and not manager.check_bridge_exists(bridge):
                line_errors.append(net_key)

        if line_errors:
            logging.debug(f"Line {i} invalid {line_errors}")
            errors.append({"line": i, "errors": line_errors})
        else:
            logging.debug(f"Line {i} valid.")

    # 5. Final summary
    logging.debug("[STEP 5] CSV validation completed. Summarizing results.")
    if errors:
        logging.error(f"CSV validation failed with {len(errors)} invalid line(s).")
        for err in errors:
            logging.error(f"Line {err['line']}: {err['errors']}")
        return False, errors
    else:
        logging.debug("CSV validation successful. All entries are valid.")
        return True, []

def clone_csv(input_csv: str, config_yaml: str, proxmox_user: str, tokens_dict: dict = None, job_id: str = None):
    """
    Clone VMs defined in CSV. 
    Version adaptée pour utiliser le ProxmoxManager et le suivi de progression.
    """
    logging.debug(f"Starting VM cloning for file: {input_csv}")

    # 1. Load CSV, config and connections
    # On s'assure de bien transmettre le tokens_dict pour le multi-serveur
    csv_handler, delimiter, rows, connections = load_csv_and_connections(
        input_csv, config_yaml, proxmox_user, tokens_dict=tokens_dict
    )
    
    if rows is None:
        return []

    # INITIALISATION DU SUIVI (Pour React)
    if job_id and job_id in clone_jobs:
        # On compte uniquement les lignes qui n'ont pas encore de statut
        clone_jobs[job_id]["total"] = len([r for r in rows if not r.get("status")])
        clone_jobs[job_id]["current"] = 0

    results_map = {}
    clone_tasks = []

    # 2. Launch all clones
    logging.debug("[CLONE] Launching clone operations.")
    
    for i, row in enumerate(rows):
        if row.get("status"):
            results_map[i] = False
            continue

        target_host = row["target_host"]
        if target_host not in connections:
            logging.error(f"[{i+1}/{len(rows)}] No connection for host '{target_host}'")
            results_map[i] = False
            rows[i]["status"] = "error"
            continue

        # --- MODIFICATION ICI : On utilise le manager déjà prêt dans connections ---
        manager = connections[target_host]["manager"]
        
        # On utilise ta nouvelle signature ProxmoxVM(manager=manager)
        vm_temp = ProxmoxVM(manager=manager)

        # Logique de nommage (Inchangée)
        vm_name = row.get("vm_name")
        if not vm_name:
            student_login = row.get("student_login")
            if student_login:
                vm_name = student_login
            else:
                student_name, student_fname = row.get("student_name", ""), row.get("student_firstname", "")
                if student_name and student_fname:
                    vm_name = f"{student_name}{student_fname[0]}"
                else:
                    results_map[i] = False
                    rows[i]["status"] = "error"
                    continue

        # Recherche du template (Utilise le nouveau vm_temp)
        template_name = row["template_name"]
        template_found, template_vmid = vm_temp.search_name(template_name, template=True)

        if not template_found:
            results_map[i] = False
            rows[i]["status"] = "error"
            continue

        # Gestion du nouvel ID (Utilise le manager)
        newid_str = row.get("newid", "").strip()
        if newid_str:
            try:
                newid = int(newid_str)
                # On vérifie si l'ID est libre avec ta nouvelle méthode
                if manager.is_vmid_used(newid):
                    logging.warning(f"ID {newid} used, getting next available.")
                    newid = manager.get_next_vmid()
            except ValueError:
                newid = manager.get_next_vmid()
        else:
            newid = manager.get_next_vmid()

        if newid is None:
            results_map[i] = False
            rows[i]["status"] = "error"
            continue

        vm_helper = ProxmoxVM(manager=manager, vmid=template_vmid)
        vm_helper.newid = newid
        vm_helper.name_vm = vm_name
        vm_helper.template_vm = template_vmid
        vm_helper.pool_vm = row["pool"]
        
        # Gestion du stockage (Logique client préservée)
        storage_csv = (row.get("storage") or "").strip()
        if storage_csv:
            vm_helper.storage_vm = storage_csv
        else:
            # On vérifie la disponibilité via le manager
            vm_helper.storage_vm = "data2" if manager.check_storage_exists("data2") else "data"

        upid = vm_helper.clone_vm()
        if upid:
            clone_tasks.append({
                "upid": upid, 
                "row_index": i, 
                "manager": manager, 
                "target_host": target_host, 
                "vm_name": vm_name,
                "vm_name_generated": vm_name, 
                "newid_generated": newid
            })
        else:
            results_map[i] = False
            rows[i]["status"] = "error"

    # 3. Monitor all clones in parallel
    if clone_tasks:
        logging.debug("[CLONE] Monitoring clone progress.")   
        # MODIFICATION ICI : On passe le job_id pour incrémenter la progression
        monitor_results = asyncio.run(_monitor_all_clones(clone_tasks, job_id))
        
        for result in monitor_results:
            if isinstance(result, Exception):
                logging.error(f"Fatal error in a monitoring task : {result}")
                continue # On passe à la ligne suivante au lieu de crasher toute l'appli
            row_index = result["row_index"]
            if result["success"]:
                rows[row_index]["status"] = "cloned"
                rows[row_index]["vm_name"] = result.get("vm_name_generated")
                rows[row_index]["newid"] = str(result.get("newid_generated"))
                results_map[row_index] = True
            else:
                rows[row_index]["status"] = "error"
                results_map[row_index] = False

    # 4. Save CSV (Inchangé)
    header = csv_handler.read_header(delimiter)
    csv_handler.write_csv(rows, header, delimiter)

    return [results_map.get(i, False) for i in range(len(rows))]

async def _monitor_all_clones(clone_tasks,job_id=None):
    """
    Monitor all clone tasks in parallel.
    clone_tasks: list of dict (upid, row_index, vm_name, manager, target_host)
    return: list of results
    """
    monitoring_tasks = [
        _monitor_clone_task(clone_info,job_id=job_id)
        for clone_info in clone_tasks
    ]
    results = await asyncio.gather(*monitoring_tasks, return_exceptions=True)
    return results

async def _monitor_clone_task(clone_info,job_id=None,check_interval=5, timeout=900):
    """
    Monitor one clone task until completion.
    clone_info: dict with upid, row_index, vm_name, manager, target_host
    check_interval: seconds between status checks (default: 5)
    timeout: maximum wait time in seconds (default: 900 = 15 minutes)
    return: dict with success, row_index, error, elapsed
    """
    upid = clone_info["upid"]
    row_index = clone_info["row_index"]
    vm_name = clone_info["vm_name"]
    manager = clone_info["manager"]
    target_host = clone_info["target_host"]
    loop = asyncio.get_event_loop()
    start_time = loop.time()
    logging.debug(f"[{target_host}] Monitoring: {vm_name}")

    while True:
        elapsed = loop.time() - start_time
        if elapsed > timeout:
            logging.error(f"[{target_host}] Timeout for {vm_name} after {timeout}s")
            return {"success": False, "row_index": row_index, "error": f"Timeout after {timeout}s"}

        status, exitstatus = await loop.run_in_executor(None, manager.get_task_status, upid)
        if status == "stopped" and exitstatus == "OK":
            if job_id and job_id in clone_jobs:
                clone_jobs[job_id]["current"] += 1

        if status is None:
            logging.error(f"[{target_host}] Unable to query status for {vm_name}")
            return {"success": False, "row_index": row_index, "error": "Unable to query task status"}
        if status == "stopped" and exitstatus == "OK":
            logging.debug(f"[{target_host}] Clone completed: {vm_name} ({int(elapsed)}s)")
            return {"success": True, "row_index": row_index, "elapsed": elapsed, "vm_name_generated": clone_info.get("vm_name_generated"), "newid_generated": clone_info.get("newid_generated")}
        elif status == "stopped":
            error_msg = exitstatus or "Unknown error"
            logging.error(f"[{target_host}] Clone failed: {vm_name} - {error_msg}")
            return {"success": False, "row_index": row_index, "error": error_msg}

        if int(elapsed) % 60 == 0 and int(elapsed) > 0:
            logging.debug(f"[{target_host}] {vm_name} still cloning... ({int(elapsed)}s)")
        await asyncio.sleep(check_interval)

def start_csv(csv_path: str, config_yaml: str, proxmox_user: str, proxmox_password: str = None, use_token: bool = False, token_name: str = None, token_value: str = None):
    """
    Start all VMs defined in the CSV file that are stopped or cloned.
    Updates the 'status' column with 'running' or 'error'.
    csv_path: path to the CSV file containing VM configurations
    config_yaml: path to the YAML configuration file with server details
    proxmox_user: Proxmox username (e.g., 'root@pam')
    proxmox_password: Proxmox password (optional if use_token=True)
    use_token: if True, use token authentication
    token_name: API token name (required if use_token=True)
    token_value: API token value (required if use_token=True)
    return: list[bool] - True if start succeeded, False otherwise (one per CSV row)
    """
    logging.debug("Starting VMs from CSV")

    # 1. Load CSV, config and connections
    csv_handler, delimiter, rows, connections = load_csv_and_connections(csv_path, config_yaml, proxmox_user, proxmox_password, use_token, token_name, token_value)
    if rows is None:
        return []
    results_map = {}

    # 2. Start VMs
    logging.debug("[START] Starting VMs.")
    for i, row in enumerate(rows):
        newid_str = row.get("newid", "").strip()
        if not newid_str:
            logging.debug(f"[{i+1}/{len(rows)}] Skipping row {i+1} - no newid")
            results_map[i] = False
            continue

        try:
            newid = int(newid_str)
        except ValueError:
            logging.error(f"[{i+1}/{len(rows)}] Invalid newid '{newid_str}'")
            results_map[i] = False
            row["status"] = "error"
            continue

        vm_name = row.get("vm_name", f"VM-{newid}")
        target_host = row["target_host"]
        if target_host not in connections:
            logging.error(f"[{i+1}/{len(rows)}] No connection for host '{target_host}'")
            results_map[i] = False
            row["status"] = "error"
            continue

        proxmox_host = connections[target_host]["proxmox_host"]
        vm_helper = ProxmoxVM(proxmox_host=proxmox_host, proxmox_user=connections["user"], proxmox_password=connections.get("password"), vmid=newid, use_token=connections.get("use_token", False), token_name=connections.get("token_name"), token_value=connections.get("token_value"))
        exists, _ = vm_helper.search_vmid(newid)
        if not exists:
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} (VMID: {newid}) not found on {target_host}")
            results_map[i] = False
            row["status"] = "error"
            continue

        current_status = vm_helper.status()
        logging.debug(f"[{i+1}/{len(rows)}] VM {vm_name} actual status: {current_status}")
        if current_status == "running":
            logging.debug(f"[{i+1}/{len(rows)}] Skipping {vm_name} - already running")
            results_map[i] = True
            row["status"] = "running"
            continue
        elif current_status != "stopped":
            logging.warning(f"[{i+1}/{len(rows)}] VM {vm_name} is in state '{current_status}' - cannot start")
            results_map[i] = False
            row["status"] = "error"
            continue

        logging.debug(f"[{i+1}/{len(rows)}] Starting VM {vm_name} (VMID: {newid})...")
        success, upid = vm_helper.start()
        if not success or not upid:
            logging.error(f"[{i+1}/{len(rows)}] Failed to start VM {vm_name} - API call failed")
            results_map[i] = False
            row["status"] = "error"
            continue

        logging.debug(f"[{i+1}/{len(rows)}] Start task launched with UPID: {upid}")
        manager = connections[target_host]["manager"]
        task_success = manager.check_task_stopped(upid, timeout_sec=60)
        if task_success:
            logging.debug(f"[{i+1}/{len(rows)}] VM {vm_name} started successfully")
            results_map[i] = True
            row["status"] = "running"
        else:
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} start task failed or timeout")
            results_map[i] = False
            row["status"] = "error"

    # 3. Save CSV
    header = csv_handler.read_header(delimiter)
    success = csv_handler.write_csv(rows, header, delimiter)
    if success:
        logging.debug(f"CSV updated successfully: {csv_path}")
    else:
        logging.error(f"Failed to update CSV: {csv_path}")

    # 4. Summary
    logging.debug("Start Operations Completed")    
    total = len(rows)
    started = sum(1 for i, r in results_map.items() if r and rows[i].get("newid"))
    skipped = sum(1 for i in range(len(rows)) if not rows[i].get("newid"))
    failed = sum(1 for i, r in results_map.items() if not r)
    logging.debug(f"Total VMs in CSV: {total}")
    logging.debug(f"Successfully started: {started}")
    logging.debug(f"Skipped (no newid): {skipped}")
    logging.debug(f"Failed: {failed}")
    return [results_map.get(i, False) for i in range(len(rows))]

def stop_csv(csv_path: str, config_yaml: str, proxmox_user: str, proxmox_password: str = None, use_token: bool = False, token_name: str = None, token_value: str = None):
    """
    Stop all VMs defined in the CSV file that are running.
    Updates the 'status' column with 'stopped' or 'error'.
    csv_path: path to the CSV file containing VM configurations
    config_yaml: path to the YAML configuration file with server details
    proxmox_user: Proxmox username (e.g., 'root@pam')
    proxmox_password: Proxmox password (optional if use_token=True)
    use_token: if True, use token authentication
    token_name: API token name (required if use_token=True)
    token_value: API token value (required if use_token=True)
    return: list[bool] - True if stop succeeded, False otherwise (one per CSV row)
    """
    logging.debug("Stopping VMs from CSV")

    # 1. Load CSV, config and connections
    csv_handler, delimiter, rows, connections = load_csv_and_connections(csv_path, config_yaml, proxmox_user, proxmox_password, use_token, token_name, token_value)
    if rows is None:
        return []
    results_map = {}

    # 2. Stop VMs
    logging.debug("[STOP] Stopping VMs.")
    for i, row in enumerate(rows):
        newid_str = row.get("newid", "").strip()
        if not newid_str:
            logging.debug(f"[{i+1}/{len(rows)}] Skipping row {i+1} - no newid")
            results_map[i] = False
            continue

        try:
            newid = int(newid_str)
        except ValueError:
            logging.error(f"[{i+1}/{len(rows)}] Invalid newid '{newid_str}'")
            results_map[i] = False
            row["status"] = "error"
            continue

        vm_name = row.get("vm_name", f"VM-{newid}")
        target_host = row["target_host"]
        if target_host not in connections:
            logging.error(f"[{i+1}/{len(rows)}] No connection for host '{target_host}'")
            results_map[i] = False
            row["status"] = "error"
            continue

        proxmox_host = connections[target_host]["proxmox_host"]
        vm_helper = ProxmoxVM(proxmox_host=proxmox_host, proxmox_user=connections["user"], proxmox_password=connections.get("password"), vmid=newid, use_token=connections.get("use_token", False), token_name=connections.get("token_name"), token_value=connections.get("token_value"))
        exists, _ = vm_helper.search_vmid(newid)
        if not exists:
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} (VMID: {newid}) not found on {target_host}")
            results_map[i] = False
            row["status"] = "error"
            continue

        current_status = vm_helper.status()
        logging.debug(f"[{i+1}/{len(rows)}] VM {vm_name} actual status: {current_status}")
        if current_status == "stopped":
            logging.debug(f"[{i+1}/{len(rows)}] Skipping {vm_name} - already stopped")
            results_map[i] = True
            row["status"] = "stopped"
            continue
        elif current_status != "running":
            logging.warning(f"[{i+1}/{len(rows)}] VM {vm_name} is in state '{current_status}' - cannot stop")
            results_map[i] = False
            row["status"] = "error"
            continue

        logging.debug(f"[{i+1}/{len(rows)}] Stopping VM {vm_name} (VMID: {newid})...")
        success, upid = vm_helper.stop()
        if not success or not upid:
            logging.error(f"[{i+1}/{len(rows)}] Failed to stop VM {vm_name} - API call failed")
            results_map[i] = False
            row["status"] = "error"
            continue

        logging.debug(f"[{i+1}/{len(rows)}] Stop task launched with UPID: {upid}")
        manager = connections[target_host]["manager"]
        task_success = manager.check_task_stopped(upid, timeout_sec=60)
        if task_success:
            logging.debug(f"[{i+1}/{len(rows)}] VM {vm_name} stopped successfully")
            results_map[i] = True
            row["status"] = "stopped"
        else:
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} stop task failed or timeout")
            results_map[i] = False
            row["status"] = "error"

    # 3. Save CSV
    header = csv_handler.read_header(delimiter)
    success = csv_handler.write_csv(rows, header, delimiter)
    if success:
        logging.debug(f"CSV updated successfully: {csv_path}")
    else:
        logging.error(f"Failed to update CSV: {csv_path}")

    # 4. Summary
    logging.debug("Stop Operations Completed")
    total = len(rows)
    stopped = sum(1 for i, r in results_map.items() if r and rows[i].get("newid"))
    skipped = sum(1 for i in range(len(rows)) if not rows[i].get("newid"))
    failed = sum(1 for i, r in results_map.items() if not r)
    logging.debug(f"Total VMs in CSV: {total}")
    logging.debug(f"Successfully stopped: {stopped}")
    logging.debug(f"Skipped (no newid): {skipped}")
    logging.debug(f"Failed: {failed}")
    return [results_map.get(i, False) for i in range(len(rows))]

def delete_csv(csv_path: str, config_yaml: str, proxmox_user: str, proxmox_password: str = None, use_token: bool = False, token_name: str = None, token_value: str = None):
    """
    Delete all VMs defined in the CSV file.
    Updates the CSV by clearing 'status' and 'ipv4' columns on success.
    csv_path: path to the CSV file containing VM configurations
    config_yaml: path to the YAML configuration file with server details
    proxmox_user: Proxmox username (e.g., 'root@pam')
    proxmox_password: Proxmox password (optional if use_token=True)
    use_token: if True, use token authentication
    token_name: API token name (required if use_token=True)
    token_value: API token value (required if use_token=True)
    return: list[bool] - True if delete succeeded, False otherwise (one per CSV row)
    """
    logging.debug("Deleting VMs from CSV")

    # 1. Load CSV, config and connections
    csv_handler, delimiter, rows, connections = load_csv_and_connections(csv_path, config_yaml, proxmox_user, proxmox_password, use_token, token_name, token_value)
    if rows is None:
        return []
    results_map = {}

    # 2. Delete VMs
    logging.debug("[DELETE] Deleting VMs.")
    for i, row in enumerate(rows):
        newid_str = row.get("newid", "").strip()
        if not newid_str:
            logging.debug(f"[{i+1}/{len(rows)}] Skipping row {i+1} - no newid")
            results_map[i] = False
            continue
        
        try:
            newid = int(newid_str)
        except ValueError:
            logging.error(f"[{i+1}/{len(rows)}] Invalid newid '{newid_str}'")
            results_map[i] = False
            row["status"] = "error"
            continue

        vm_name = row.get("vm_name", f"VM-{newid}")
        target_host = row["target_host"]
        if target_host not in connections:
            logging.error(f"[{i+1}/{len(rows)}] No connection for host '{target_host}'")
            results_map[i] = False
            row["status"] = "error"
            continue
        
        proxmox_host = connections[target_host]["proxmox_host"]
        vm_helper = ProxmoxVM(proxmox_host=proxmox_host, proxmox_user=connections["user"], proxmox_password=connections.get("password"), vmid=newid, use_token=connections.get("use_token", False), token_name=connections.get("token_name"), token_value=connections.get("token_value"))
        exists, actual_vm_name = vm_helper.search_vmid(newid)
        if not exists:
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} (VMID: {newid}) not found on {target_host} - marking as success")
            results_map[i] = False
            row["status"] = ""
            row["ipv4"] = ""
            continue

        if actual_vm_name != vm_name:
            logging.error(f"[{i+1}/{len(rows)}] VMID {newid} exists but name mismatch! Expected: '{vm_name}', Found: '{actual_vm_name}'")
            results_map[i] = False
            row["status"] = "error"
            continue

        current_status = vm_helper.status()
        logging.debug(f"[{i+1}/{len(rows)}] VM {vm_name} actual status: {current_status}")
        if current_status != "stopped":
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} is '{current_status}' - must be stopped before deletion")
            results_map[i] = False
            row["status"] = "error"
            continue

        logging.debug(f"[{i+1}/{len(rows)}] Deleting VM {vm_name} (VMID: {newid})...")
        success, upid = vm_helper.delete()
        if not success or not upid:
            logging.error(f"[{i+1}/{len(rows)}] Failed to delete VM {vm_name} - API call failed")
            results_map[i] = False
            row["status"] = "error"
            continue

        logging.debug(f"[{i+1}/{len(rows)}] Delete task launched with UPID: {upid}")
        manager = connections[target_host]["manager"]
        task_success = manager.check_task_stopped(upid, timeout_sec=120)
        if task_success:
            logging.debug(f"[{i+1}/{len(rows)}] VM {vm_name} deleted successfully")
            results_map[i] = True
            row["status"] = ""
            row["ipv4"] = ""
            row["newid"] = ""
        else:
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} delete task failed or timeout")
            results_map[i] = False
            row["status"] = "error"

    # 3. Save CSV
    header = csv_handler.read_header(delimiter)
    success = csv_handler.write_csv(rows, header, delimiter)
    if success:
        logging.debug(f"CSV updated successfully: {csv_path}")
    else:
        logging.error(f"Failed to update CSV: {csv_path}")

    # 4. Summary
    logging.debug("Delete Operations Completed")
    total = len(rows)
    deleted = sum(1 for i, r in results_map.items() if r and rows[i].get("newid"))
    skipped = sum(1 for i in range(len(rows)) if not rows[i].get("newid"))
    failed = sum(1 for i, r in results_map.items() if not r)
    logging.debug(f"Total VMs in CSV: {total}")
    logging.debug(f"Successfully deleted: {deleted}")
    logging.debug(f"Skipped (no newid): {skipped}")
    logging.debug(f"Failed: {failed}")
    return [results_map.get(i, False) for i in range(len(rows))]

def networkbridge_csv(csv_path: str, config_yaml: str, proxmox_user: str, proxmox_password: str = None, use_token: bool = False, token_name: str = None, token_value: str = None):
    """
    Update network bridge configuration for VMs defined in the CSV file.
    Reads net0 and net1 values from CSV and applies them to the corresponding VMs.
    If a network interface doesn't exist on the VM, it will be created first.
    Network changes support hotplug, so VMs can be running during the operation.
    csv_path: path to the CSV file containing VM configurations
    config_yaml: path to the YAML configuration file with server details
    proxmox_user: Proxmox username (e.g., 'root@pam')
    proxmox_password: Proxmox password (optional if use_token=True)
    use_token: if True, use token authentication
    token_name: API token name (required if use_token=True)
    token_value: API token value (required if use_token=True)
    return: list[bool] - True if update succeeded, False otherwise (one per CSV row)
    """
    logging.debug("Updating network bridges from CSV")

    # 1. Load CSV, config and connections
    csv_handler, delimiter, rows, connections = load_csv_and_connections(csv_path, config_yaml, proxmox_user, proxmox_password, use_token, token_name, token_value)
    if rows is None:
        return []
    results_map = {}

    # 2. Update network bridges
    logging.debug("[NETWORK] Updating network bridges.")
    for i, row in enumerate(rows):
        newid_str = row.get("newid", "").strip()
        if not newid_str:
            logging.debug(f"[{i+1}/{len(rows)}] Skipping row {i+1} - no newid")
            results_map[i] = False
            continue

        try:
            newid = int(newid_str)
        except ValueError:
            logging.error(f"[{i+1}/{len(rows)}] Invalid newid '{newid_str}'")
            results_map[i] = False
            continue

        vm_name = row.get("vm_name", f"VM-{newid}")
        net0 = row.get("net0", "").strip()
        net1 = row.get("net1", "").strip()
        if not net0 and not net1:
            logging.debug(f"[{i+1}/{len(rows)}] Skipping {vm_name} - no network bridges defined")
            results_map[i] = False
            continue

        target_host = row["target_host"]
        if target_host not in connections:
            logging.error(f"[{i+1}/{len(rows)}] No connection for host '{target_host}'")
            results_map[i] = False
            continue

        proxmox_host = connections[target_host]["proxmox_host"]
        vm_helper = ProxmoxVM(proxmox_host=proxmox_host, proxmox_user=connections["user"], proxmox_password=connections.get("password"), vmid=newid, use_token=connections.get("use_token", False), token_name=connections.get("token_name"), token_value=connections.get("token_value"))
        exists, _ = vm_helper.search_vmid(newid)
        if not exists:
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} (VMID: {newid}) not found on {target_host}")
            results_map[i] = False
            continue
        logging.debug(f"[{i+1}/{len(rows)}] Processing network bridges for VM {vm_name} (VMID: {newid})")

        current_interfaces = vm_helper.get_network_interfaces()
        if current_interfaces is None:
            logging.error(f"[{i+1}/{len(rows)}] Unable to retrieve network interfaces for VM {vm_name}")
            results_map[i] = False
            continue

        row_success = True
        if net0:
            if "net0" not in current_interfaces:
                logging.debug(f"[{i+1}/{len(rows)}] net0 doesn't exist on VM {vm_name}, adding it")
                if not vm_helper.add_network_interface(net="net0", bridge=net0):
                    logging.error(f"[{i+1}/{len(rows)}] Failed to add net0 to VM {vm_name}")
                    row_success = False
                else:
                    logging.debug(f"[{i+1}/{len(rows)}] net0 added successfully with bridge {net0}")
            else:
                logging.debug(f"[{i+1}/{len(rows)}] Updating net0 bridge to {net0}")
                if not vm_helper.set_network_bridge("net0", net0):
                    logging.error(f"[{i+1}/{len(rows)}] Failed to update net0 bridge for VM {vm_name}")
                    row_success = False
                else:
                    logging.debug(f"[{i+1}/{len(rows)}] net0 bridge updated successfully to {net0}")
        
        if net1:
            if "net1" not in current_interfaces:
                logging.debug(f"[{i+1}/{len(rows)}] net1 doesn't exist on VM {vm_name}, adding it")
                if not vm_helper.add_network_interface(net="net1", bridge=net1):
                    logging.error(f"[{i+1}/{len(rows)}] Failed to add net1 to VM {vm_name}")
                    row_success = False
                else:
                    logging.debug(f"[{i+1}/{len(rows)}] net1 added successfully with bridge {net1}")
            else:
                logging.debug(f"[{i+1}/{len(rows)}] Updating net1 bridge to {net1}")
                if not vm_helper.set_network_bridge("net1", net1):
                    logging.error(f"[{i+1}/{len(rows)}] Failed to update net1 bridge for VM {vm_name}")
                    row_success = False
                else:
                    logging.debug(f"[{i+1}/{len(rows)}] net1 bridge updated successfully to {net1}")
        
        results_map[i] = row_success
        if row_success:
            logging.debug(f"[{i+1}/{len(rows)}] Network bridges updated successfully for VM {vm_name}")
        else:
            logging.error(f"[{i+1}/{len(rows)}] Failed to update network bridges for VM {vm_name}")

    # 3. Summary
    logging.debug("Network Bridge Update Operations Completed")
    total = len(rows)
    updated = sum(1 for i, r in results_map.items() if r and rows[i].get("newid"))
    skipped = sum(1 for i in range(len(rows)) if not rows[i].get("newid") or (not rows[i].get("net0") and not rows[i].get("net1")))
    failed = sum(1 for i, r in results_map.items() if not r)
    logging.debug(f"Total VMs in CSV: {total}")
    logging.debug(f"Successfully updated: {updated}")
    logging.debug(f"Skipped (no newid or no bridges defined): {skipped}")
    logging.debug(f"Failed: {failed}")
    logging.debug("=" * 70)
    return [results_map.get(i, False) for i in range(len(rows))]

def managementip_csv(csv_path: str, config_yaml: str, proxmox_user: str, proxmox_password: str = None, use_token: bool = False, token_name: str = None, token_value: str = None):
    """
    Retrieve and store management IP addresses for running VMs defined in the CSV file.
    Only processes VMs with status 'running'. Waits up to 3 minutes per VM for QEMU agent to respond.
    Updates the 'ipv4' column with the detected management IP address.
    csv_path: path to the CSV file containing VM configurations
    config_yaml: path to the YAML configuration file with server details
    proxmox_user: Proxmox username (e.g., 'root@pam')
    proxmox_password: Proxmox password (optional if use_token=True)
    use_token: if True, use token authentication
    token_name: API token name (required if use_token=True)
    token_value: API token value (required if use_token=True)
    return: list[bool] - True if IP retrieved successfully, False otherwise (one per CSV row)
    """
    logging.debug("Retrieving management IP addresses from running VMs (sequential mode)")

    # 1. Load CSV, config and connections
    csv_handler, delimiter, rows, connections = load_csv_and_connections(csv_path, config_yaml, proxmox_user, proxmox_password, use_token, token_name, token_value)
    if rows is None:
        return []
    results_map = {}

    # 2. Process VMs sequentially
    logging.debug("[IP] Retrieving management IPs sequentially.")
    for i, row in enumerate(rows):
        newid_str = row.get("newid", "").strip()

        if not newid_str:
            logging.error(f"[{i+1}/{len(rows)}] No newid - cannot retrieve IP")
            results_map[i] = False
            rows[i]["ipv4"] = ""
            continue

        try:
            newid = int(newid_str)
        except ValueError:
            logging.error(f"[{i+1}/{len(rows)}] Invalid newid '{newid_str}'")
            results_map[i] = False
            rows[i]["ipv4"] = ""
            continue

        target_host = row["target_host"]
        vm_name = row.get("vm_name", f"VM-{newid}")
        if target_host not in connections:
            logging.error(f"[{i+1}/{len(rows)}] No connection for host '{target_host}'")
            results_map[i] = False
            rows[i]["ipv4"] = ""
            continue

        proxmox_host = connections[target_host]["proxmox_host"]
        vm_helper = ProxmoxVM(proxmox_host=proxmox_host, proxmox_user=connections["user"], proxmox_password=connections.get("password"), vmid=newid, use_token=connections.get("use_token", False), token_name=connections.get("token_name"), token_value=connections.get("token_value"))
        exists, _ = vm_helper.search_vmid(newid)
        if not exists:
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} (VMID: {newid}) not found on {target_host}")
            results_map[i] = False
            rows[i]["ipv4"] = ""
            continue

        current_status = vm_helper.status()
        logging.debug(f"[{i+1}/{len(rows)}] VM {vm_name} actual status: {current_status}")
        if current_status != "running":
            logging.error(f"[{i+1}/{len(rows)}] VM {vm_name} is not running (status: {current_status}) - cannot retrieve IP")
            results_map[i] = False
            rows[i]["ipv4"] = ""
            continue

        agent_status = vm_helper.status_agent()
        if agent_status != True:
            logging.error(f"[{i+1}/{len(rows)}] QEMU agent not enabled for VM {vm_name} - cannot retrieve IP")
            results_map[i] = False
            rows[i]["ipv4"] = ""
            continue

        logging.debug(f"[{i+1}/{len(rows)}] [{target_host}] Processing {vm_name}")
        timeout = 180
        ping_interval = 2
        start_time = time.time()
        agent_ready = False
        ping_attempts = 0

        while True:
            elapsed = time.time() - start_time
            if elapsed > timeout:
                logging.error(f"[{i+1}/{len(rows)}] [{target_host}] Timeout for {vm_name} after {timeout}s (tried {ping_attempts} pings)")
                results_map[i] = False
                rows[i]["ipv4"] = ""
                break

            ping_attempts += 1
            agent_ready = vm_helper.ping_agent()
            if ping_attempts % 10 == 0:
                logging.debug(f"[{i+1}/{len(rows)}] [{target_host}] Waiting for {vm_name}... ({int(elapsed)}s/{timeout}s, {ping_attempts} pings)")
            if agent_ready:
                logging.debug(f"[{i+1}/{len(rows)}] [{target_host}] Agent responded for {vm_name} (after {ping_attempts} pings, {int(elapsed)}s)")
                break
            time.sleep(ping_interval)

        if agent_ready:
            management_ip = None
            ip_attempts = 0
            max_ip_attempts = 30

            while ip_attempts < max_ip_attempts:
                elapsed = time.time() - start_time
                if elapsed > timeout:
                    logging.error(f"[{i+1}/{len(rows)}] [{target_host}] Global timeout reached while retrieving IP for {vm_name}")
                    break
                
                ip_attempts += 1
                management_ip = vm_helper.management_ip()
                if management_ip:
                    logging.debug(f"[{i+1}/{len(rows)}] [{target_host}] IP retrieved for {vm_name}: {management_ip} (after {ip_attempts} attempts)")
                    break
                if ip_attempts % 5 == 0:
                    logging.debug(f"[{i+1}/{len(rows)}] [{target_host}] Waiting for IP from {vm_name}... (attempt {ip_attempts}/{max_ip_attempts})")
                time.sleep(2)
            
            if management_ip:
                rows[i]["ipv4"] = management_ip
                results_map[i] = True
            else:
                logging.error(f"[{i+1}/{len(rows)}] [{target_host}] No management IP found for {vm_name} after {ip_attempts} attempts")
                rows[i]["ipv4"] = ""
                results_map[i] = False

    # 3. Save CSV
    header = csv_handler.read_header(delimiter)
    success = csv_handler.write_csv(rows, header, delimiter)
    if success:
        logging.debug(f"CSV updated successfully: {csv_path}")
    else:
        logging.error(f"Failed to update CSV: {csv_path}")

    # 4. Summary
    logging.debug("Management IP Retrieval Operations Completed")
    total = len(rows)
    retrieved = sum(1 for r in results_map.values() if r)
    failed = len(rows) - retrieved
    logging.debug(f"Total VMs in CSV: {total}")
    logging.debug(f"Successfully retrieved IPs: {retrieved}")
    logging.debug(f"Failed: {failed}")
    logging.debug("=" * 70)
    return [results_map.get(i, False) for i in range(len(rows))]