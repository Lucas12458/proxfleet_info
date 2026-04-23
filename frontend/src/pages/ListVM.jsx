import "../styles/listvm.css";
import { useState, useEffect } from "react";
import { ClipLoader } from "react-spinners";

export default function ListVM({ server, vms, onLogout, allServersData, isMulti, onRefresh, addLog }) {
  const header = isMulti
    ? ["server", "vmid", "name", "status", "actions"]
    : ["vmid", "name", "status", "actions"];

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ keyToSort: "name", direction: "asc" });
  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [availableServers, setAvailableServers] = useState([]);
  const [createServer, setCreateServer] = useState(server || "");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // On stocke les clés sous la forme "vmid-action" ou "server-vmid-action"
 const [actionLoading, setActionLoading] = useState({});

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
      setTimeout(() => onRefresh(), 4000);
    } catch {
      alert("Erreur réseau lors de la création de la VM");
    }

    setVmName("");
    setShowInput(false);
  }

  async function vmAction(vmid, action, targetServer) {
    const srv = targetServer || server;
    const actionKey = `${srv}-${vmid}-${action}`; // Clé unique

    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch(`${API_BASE}/server/${srv}/vm/${vmid}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action })
      });

      const data = await res.json();

      if (res.ok && data[0] === true) {
        const upid = data[1];
        addLog(`[Action] ${action} lancée sur VM ${vmid}`, "info");
        checkTaskStatus(srv, upid, action, vmid);
      } else {
        addLog(`Erreur : ${data[1] || "Action refusée"}`, "error");
        setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[actionKey];
        return newState;
      });
      }
    } catch (err) {
      addLog(`Erreur réseau : ${err.message}`, "error");
      setActionLoading(prev => {
      const newState = { ...prev };
      delete newState[actionKey];
      return newState;
    });
    }
  }

  async function checkTaskStatus(srv, upid, action, vmid) {
    const actionKey = `${srv}-${vmid}-${action}`;
  
    try {
      const res = await fetch(`${API_BASE}/server/${srv}/task/status?upid=${upid}`, {
        credentials: "include"
      });
  
      if (!res.ok) {
        setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
        return;
      }
  
      const task = await res.json(); // ["running", null] ou ["stopped", "OK"]
      console.log("Réponse API Status:", task);
  
      //Si la tâche n'est pas terminée → on continue le polling
      if (task[0] !== "stopped") {
        console.log("tâche en cours");
        setTimeout(() => checkTaskStatus(srv, upid, action, vmid), 1000);
        return;
      }
  
      // Ici la tâche est STOPPED → on peut récupérer le log
      const res2 = await fetch(`${API_BASE}/server/${srv}/task/log?upid=${upid}`, {
        credentials: "include"
      });
  
      const task2 = await res2.json();
      console.log("Réponse API log:", task2);
  
      const resultColor = task[1] === "OK" ? "success" : "error";
  
      addLog(`[Proxmox] ${action} sur VM ${vmid} : ${task2.full_log}`, resultColor);
      //addLog(`[Proxmox] Log de la tâche : ${task2.full_log || "Aucun log"}`, "info");
  
      //Fin du chargement
      setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[actionKey];
        return newState;
      });
  
      onRefresh();
      console.log("tâche terminée");
  
    } catch (err) {
      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
      console.error("Erreur suivi tâche:", err);
    }
  }
  

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
    vmList.filter(vm => {
      const globalMatch = vm.name?.toLowerCase().includes(search.toLowerCase());
      const columnMatch = header.filter(h => h !== "actions").every(h => {
        const val = filters[h] || "";
        if (!val) return true;
        return String(vm[h] ?? "").toLowerCase().includes(val.toLowerCase());
      });
      return globalMatch && columnMatch;
    })
  );

  const handleLocalLogout = async () => {
    setIsLoggingOut(true);
    try {
      // On attend que la fonction de déconnexion (passée en prop) se termine
      await onLogout();
    } catch (err) {
      console.error("Erreur déconnexion:", err);
      setIsLoggingOut(false);
    }
    // Note : On ne met pas forcément setIsLoggingOut(false) dans un 'finally' ici 
    // car si le logout réussit, le composant va être démonté (redirection).
  };

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
        
      </div>

      <div className="toolbar-row">
        <div className="create-side">
          <button className="create-btn" onClick={onRefresh}>
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
              <th style={{ width: "40px", textAlign: "center" }}>
              <button
                className={`filter-toggle-btn ${showFilters ? "active" : ""}`}
                onClick={e => { e.stopPropagation(); setShowFilters(prev => !prev); }}
                title="Filtres par colonne"
              >
                {showFilters ? "❌" : "🔍"}
              </button>
              </th>
            </tr>
            {showFilters && (
              <tr>
                {header.map(h => (
                  <th key={h} style={{ padding: "4px 8px", background: "#f0f4ff" }}>
                    {h !== "actions" && (
                      <input
                        type="text"
                        className="filter-input"
                        placeholder="Filtrer..."
                        value={filters[h] || ""}
                        onChange={e => setFilters(prev => ({ ...prev, [h]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                      />
                    )}
                  </th>
                ))}
                <th style={{ background: "#000000" }} />
              </tr>
            )}
          </thead>
          <tbody>
            {filtered.map(vm => (
              <tr key={`${vm.server || server}-${vm.vmid}`}>
                {isMulti && <td>{vm.server}</td>}
                <td>{vm.vmid}</td>
                <td>{vm.name}</td>
                <td>{vm.status}</td>
               <td className="vm-actions">
                {["start", "stop", "shutdown", "delete"].map((action) => {
                  const srv = vm.server || server;
                  const actionKey = `${srv}-${vm.vmid}-${action}`;
                  const isLoading = actionLoading[actionKey];

                  return (
                      <button key={action} className={`btn-${action}`} onClick={() => vmAction(vm.vmid, action, vm.server)}
                      disabled={isLoading || Object.keys(actionLoading).some(key => key.startsWith(`${srv}-${vm.vmid}`))}
                      >
                      {isLoading ? (<ClipLoader color="#ffffff" size={15} />) : (action.charAt(0).toUpperCase() + action.slice(1))}
                      </button>
                      );
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}