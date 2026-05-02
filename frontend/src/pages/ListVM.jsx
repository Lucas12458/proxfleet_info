import "../styles/listvm.css";
import { useState, useMemo, useEffect } from 'react';
import { ClipLoader } from "react-spinners";

const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

export default function ListVM({ server, vms, allServersData, isMulti, onRefresh, addLog }) {
  const header = useMemo(() => {
    return isMulti
      ? ["server", "vmid", "name", "status", "actions"]
      : ["vmid", "name", "status", "actions"];
  }, [isMulti]);

  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ keyToSort: "vmid", direction: "asc" });
  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [availableServers, setAvailableServers] = useState([]);
  const [createServer, setCreateServer] = useState(server || "");
  const [actionLoading, setActionLoading] = useState({});

  // ─── Sélection multiple ────────────────────────────────────────────────────
  const [selectedVMs, setSelectedVMs] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchServers() {
      try {
        const res = await fetch(`${API_BASE}/servers`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const hosts = data.map(s => s.host);
        setAvailableServers(hosts);
        if (!server && hosts.length > 0) setCreateServer(hosts[0]);
      } catch (err) {
        console.error("Erreur de chargement des serveurs :", err);
      }
    }
    fetchServers();
  }, [server]);

  // Dérivation de l'état principal
  const vmList = useMemo(() => {
    const data = isMulti ? allServersData : vms;
    if (isMulti && data) {
      return data.flatMap(srv => srv.vms.map(vm => ({ ...vm, server: srv.server })));
    }
    return data || [];
  }, [isMulti, allServersData, vms]);



  const filtered = useMemo(() => {
    // 1. Étape de filtrage
    const filteredArray = vmList.filter(vm => {
      const globalMatch = vm.name?.toLowerCase().includes(search.toLowerCase());
      const columnMatch = header.filter(h => h !== "actions").every(h => {
        const val = filters[h] || "";
        
        // eslint-disable-next-line security/detect-object-injection
        const vmValue = vm[h];
        return !val || String(vmValue ?? "").toLowerCase().includes(val.toLowerCase());
      });
      return globalMatch && columnMatch;
    });

    // 2. Étape de tri
    const key = sort.keyToSort;
    if (key === "actions") return filteredArray;

    return filteredArray.sort((a, b) => {
      // eslint-disable-next-line security/detect-object-injection
      const aVal = a[key];
      // eslint-disable-next-line security/detect-object-injection
      const bVal = b[key];
      
      return sort.direction === "asc" 
        ? (aVal > bVal ? 1 : -1) 
        : (aVal > bVal ? -1 : 1);
    });
  }, [vmList, search, header, filters, sort]); // sort est bien dans les dépendances !

  // ─── Helpers sélection ────────────────────────────────────────────────────
  const vmKey = (vm) => `${vm.server || server}-${vm.vmid}`;

  const toggleSelect = (vm) => {
    setSelectedVMs(prev => {
      const next = new Set(prev);
      next.has(vmKey(vm)) ? next.delete(vmKey(vm)) : next.add(vmKey(vm));
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedVMs.size === filtered.length) {
      setSelectedVMs(new Set());
    } else {
      setSelectedVMs(new Set(filtered.map(vmKey)));
    }
  };

  const selectedList = filtered.filter(vm => selectedVMs.has(vmKey(vm)));

  async function bulkAction(action) {
    if (selectedList.length === 0) return;
    setBulkLoading(true);
    await Promise.all(selectedList.map(vm => vmAction(vm.vmid, action, vm.server)));
    setBulkLoading(false);
    setSelectedVMs(new Set());
  }
  // ──────────────────────────────────────────────────────────────────────────

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
        body: JSON.stringify({ newid: null, name: vmName, template: 500, pool: "projetinfo", storage: storageName })
      });
      if (!response.ok) { alert(`Erreur lors de la création : serveur ${targetServer} indisponible`); return; }
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
    const actionKey = `${srv}-${vmid}-${action}`;
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
        addLog(`[Action] ${action} lancée sur VM ${vmid}`, "info");
        checkTaskStatus(srv, data[1], action, vmid);
      } else {
        addLog(`Erreur : ${data[1] || "Action refusée"}`, "error");
        setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
      }
    } catch (err) {
      addLog(`Erreur réseau : ${err.message}`, "error");
      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
    }
  }

  async function checkTaskStatus(srv, upid, action, vmid) {
    const actionKey = `${srv}-${vmid}-${action}`;
    try {
      const res = await fetch(`${API_BASE}/server/${srv}/task/status?upid=${upid}`, { credentials: "include" });
      if (!res.ok) { setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; }); return; }
      const task = await res.json();
      if (task[0] !== "stopped") { setTimeout(() => checkTaskStatus(srv, upid, action, vmid), 1000); return; }
      const res2 = await fetch(`${API_BASE}/server/${srv}/task/log?upid=${upid}`, { credentials: "include" });
      const task2 = await res2.json();
      addLog(`[Proxmox] ${action} sur VM ${vmid} : ${task2.full_log}`, task[1] === "OK" ? "success" : "error");
      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
      onRefresh();
    } catch (err) {
      console.error(err);
      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
    }
  }

  function handleHeaderClick(h) {
    setSort({ keyToSort: h, direction: h === sort.keyToSort ? (sort.direction === "asc" ? "desc" : "asc") : "asc" });
  }

  const Arrow = ({ col }) => {
    if (sort.keyToSort !== col) return null;
    return <span style={{ marginLeft: 4 }}>{sort.direction === "asc" ? "▲" : "▼"}</span>;
  };

  const allSelected = filtered.length > 0 && selectedVMs.size === filtered.length;

  return (
    <>
      <div className="vm-header breadcrumb-header">
        <div className="breadcrumb">
          <span className="breadcrumb-path">Machines Virtuelles</span>
          <span className="breadcrumb-separator">/</span>
          <h2 className="breadcrumb-current">
            {isMulti ? "Vue globale" : server}
          </h2>
        </div>
     </div>
    
    
    
      <div className="toolbar-row">
        <div className="create-side">
          <button className="create-btn" onClick={onRefresh}>🔄 Refresh</button>
          {!showInput && (
            <button className="create-btn" onClick={() => setShowInput(true)}>Créer VM</button>
          )}
          {showInput && (
            <>
              {isMulti && (
                <select value={createServer} onChange={e => setCreateServer(e.target.value)}>
                  {availableServers.length > 0
                    ? availableServers.map(s => <option key={s} value={s}>{s}</option>)
                    : <option value="">Chargement...</option>}
                </select>
              )}
              <input type="text" className="create-input" placeholder="Nom de la VM"
                value={vmName} onChange={e => setVmName(e.target.value)} />
              <button className="create-btn" onClick={createVMConfirm}>Confirmer</button>
            </>
          )}
        </div>
        <div className="search-row">
          <input placeholder="Rechercher une VM..." type="text"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ─── Barre d'actions groupées ──────────────────────────────────────── */}
      {selectedVMs.size > 0 && (
        <div className="bulk-actions-bar">
          <span className="bulk-count">{selectedVMs.size} VM{selectedVMs.size > 1 ? "s" : ""} sélectionnée{selectedVMs.size > 1 ? "s" : ""}</span>
          {["start", "stop", "shutdown", "delete"].map(action => (
            <button
              key={action}
              className={`btn-${action}`}
              disabled={bulkLoading}
              onClick={() => bulkAction(action)}
            >
              {bulkLoading ? <ClipLoader color="#ffffff" size={13} /> : action.charAt(0).toUpperCase() + action.slice(1)}
            </button>
          ))}
          <button className="create-btn" onClick={() => setSelectedVMs(new Set())}>✕ Désélectionner</button>
        </div>
      )}
      {/* ──────────────────────────────────────────────────────────────────── */}

      <div className="vm-table-wrapper">
        <table className="vm-table">
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  title="Tout sélectionner"
                />
              </th>
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
  <tr className="filter-row">
    {/* Première cellule (checkbox) */}
    <th className="filter-cell-bg" /> 
    
    {header.map(h => (
      <th key={h} className="filter-cell-bg" style={{ padding: "4px 8px" }}>
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

    {/* Dernière cellule (actions) */}
    <th className="filter-cell-bg" />
  </tr>
)}
          </thead>
          <tbody>
            {filtered.map(vm => (
              <tr
                key={vmKey(vm)}
                className={selectedVMs.has(vmKey(vm)) ? "row-selected" : ""}
              >
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedVMs.has(vmKey(vm))}
                    onChange={() => toggleSelect(vm)}
                  />
                </td>
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
                      <button key={action} className={`btn-${action}`}
                        onClick={() => vmAction(vm.vmid, action, vm.server)}
                        disabled={isLoading || Object.keys(actionLoading).some(k => k.startsWith(`${srv}-${vm.vmid}`))}
                      >
                        {isLoading ? <ClipLoader color="#ffffff" size={15} /> : action.charAt(0).toUpperCase() + action.slice(1)}
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