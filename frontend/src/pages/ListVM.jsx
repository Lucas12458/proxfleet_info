import "../styles/listvm.css";
import { useState, useEffect } from "react";

export default function ListVM({ server, vms, onLogout, allServersData, isMulti, onRefresh,addLog }) {
  const header = isMulti
    ? ["server", "vmid", "name", "status", "actions"]
    : ["vmid", "name", "status", "actions"];

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ keyToSort: "name", direction: "asc" });
  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false);

  const [availableServers, setAvailableServers] = useState([]);
  const [createServer, setCreateServer] = useState(server || "");

  useEffect(() => {
    async function fetchServers() {
      try {
        const res = await fetch(`${API_BASE}/servers`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const hosts = data.map(s => s.host);
        setAvailableServers(hosts);
        if (!server && hosts.length > 0) {
          setCreateServer(hosts[0]);
        }
      } catch {}
    }
    fetchServers();
  }, []);

  const buildList = (data) => {
    if (isMulti && data) {
      return data.flatMap(srv =>
        srv.vms.map(vm => ({ ...vm, server: srv.server }))
      );
    }
    return data || [];
  };

  const [vmList, setVmList] = useState(buildList(isMulti ? allServersData : vms));

  useEffect(() => {
    setVmList(buildList(isMulti ? allServersData : vms));
  }, [vms, allServersData, isMulti]);

  // --- ACTIONS ---
  
  async function createVMConfirm() {
    if (!vmName.trim()) return alert("Entre un nom de VM");
    const targetServer = isMulti ? createServer : server;
    if (!targetServer) return alert("Aucun serveur disponible");

    const storageName = (targetServer === "pm-serv18" || targetServer === "pm-serv19") ? "data2" : "data";

    try {
      const response = await fetch(`${API_BASE}/server/${targetServer}/vm/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          newid: null,
          name: vmName,
          template: 500,
          pool: "projetinfo",
          storage: storageName
        })
      });

      if (!response.ok) {
        alert(`Erreur lors de la création : serveur ${targetServer} indisponible`);
        return;
      }

      await response.json();
      // On utilise onRefresh du parent après un délai
      setTimeout(() => onRefresh(), 4000);
    } catch {
      alert("Erreur réseau lors de la création de la VM");
    }

    setVmName("");
    setShowInput(false);
  }

  async function vmAction(vmid, action, targetServer) {
    const srv = targetServer || server;
    try {
      const res = await fetch(`${API_BASE}/server/${srv}/vm/${vmid}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action })
      });
  
      const data = await res.json(); // [true, "UPID..."]
  
      if (res.ok && data[0] === true) {
        const upid = data[1];
        addLog(`[Action] ${action} lancée sur VM ${vmid}`, "info");
  
        // On commence à surveiller le statut de cet UPID
        checkTaskStatus(srv, upid, action, vmid);
      } else {
        addLog(`Erreur : ${data[1] || "Action refusée"}`, "error");
      }
    } catch (err) {
      addLog(`Erreur réseau : ${err.message}`, "error");
    }
  }
  
  // Nouvelle fonction pour interroger le statut
  async function checkTaskStatus(srv, upid, action, vmid) {
    try {
      // On appelle ta route GET /server/{host}/task/status?upid=...
      const res = await fetch(`${API_BASE}/server/${srv}/task/status?upid=${upid}`, {
        credentials: "include"
      });
      
      if (!res.ok) return;
      const task = await res.json(); // Reçoit l'objet de statut de Proxmox
      console.log("Réponse API Status:", task);
      
      if (task[0] === "stopped") {
        const resultColor = task[1] === "OK" ? "success" : "error";
        addLog(`[Proxmox] Fin de ${action} sur VM ${vmid} : ${task[1]}`, resultColor);
        
        // Une fois fini, on rafraîchit la liste des VMs
        onRefresh();
        console.log("tache fini");
      } else {
        console.log("tache en cours");
        // Si c'est toujours "running", on recommence dans 1 seconde
        setTimeout(() => checkTaskStatus(srv, upid, action, vmid), 1000);
      }
    } catch (err) {
      console.error("Erreur suivi tâche:", err);
    }
  }

  // --- TRI ET FILTRE ---

  function handleHeaderClick(h) {
    setSort({
      keyToSort: h,
      direction: h === sort.keyToSort
        ? sort.direction === "asc" ? "desc" : "asc"
        : "asc"
    });
  }

  function getSortedArray(arr) {
    const key = sort.keyToSort;
    if (key === "actions") return arr;
    return [...arr].sort((a, b) =>
      sort.direction === "asc"
        ? a[key] > b[key] ? 1 : -1
        : a[key] > b[key] ? -1 : 1
    );
  }

  const filtered = getSortedArray(
    vmList.filter(vm => vm.name?.toLowerCase().includes(search.toLowerCase()))
  );

  const Arrow = ({ col }) => {
    if (sort.keyToSort !== col) return null;
    return <span style={{ marginLeft: 4 }}>{sort.direction === "asc" ? "▲" : "▼"}</span>;
  };

  return (
    <>
      <div className="vm-header">
        <h2 className="vm-title">
          {isMulti ? "VMs — Tous les serveurs" : `VMs du serveur ${server}`}
        </h2>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </div>

      <div className="toolbar-row">
        <div className="create-side" style={{ display: 'flex', gap: '10px' }}>
          <button className="create-btn" onClick={onRefresh} style={{ backgroundColor: '#2196F3' }}>
            🔄 Refresh
          </button>

          {!showInput && (
            <button className="create-btn" onClick={() => setShowInput(true)}>
              Créer VM
            </button>
          )}
          {showInput && (
            <>
              {isMulti && (
                <select
                  value={createServer}
                  onChange={e => setCreateServer(e.target.value)}
                >
                  {availableServers.length > 0
                    ? availableServers.map(s => <option key={s} value={s}>{s}</option>)
                    : <option value="">Chargement...</option>
                  }
                </select>
              )}
              <input
                type="text"
                className="create-input"
                placeholder="Nom de la VM"
                value={vmName}
                onChange={e => setVmName(e.target.value)}
              />
              <button className="create-btn" onClick={createVMConfirm}>
                Confirmer
              </button>
            </>
          )}
        </div>

        <div className="search-row">
          <input
            placeholder="Rechercher une VM..."
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="vm-table-wrapper">
        <table className="vm-table">
          <thead>
            <tr>
              {header.map(h => (
                <th key={h} onClick={() => handleHeaderClick(h)} style={{ cursor: "pointer" }}>
                  {h.charAt(0).toUpperCase() + h.slice(1)}
                  <Arrow col={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(vm => (
              <tr key={`${vm.server || server}-${vm.vmid}`}>
                {isMulti && <td>{vm.server}</td>}
                <td>{vm.vmid}</td>
                <td>{vm.name}</td>
                <td>{vm.status}</td>
                <td className="vm-actions">
                  <button className="btn-start" onClick={() => vmAction(vm.vmid, "start", vm.server)}>Start</button>
                  <button className="btn-stop" onClick={() => vmAction(vm.vmid, "stop", vm.server)}>Stop</button>
                  <button className="btn-shutdown" onClick={() => vmAction(vm.vmid, "shutdown", vm.server)}>Shutdown</button>
                  <button className="btn-delete" onClick={() => vmAction(vm.vmid, "delete", vm.server)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}