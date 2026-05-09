import "../styles/listvm.css";
import { useState, useMemo, useEffect } from 'react';
import { ClipLoader } from "react-spinners";
import {CreateVmModal} from "./CloneVm";

const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

export default function ListVM({ server, vms, allServersData, isMulti, onRefresh, addLog, user }) {
  const header = useMemo(() => {
    return isMulti
      ? ["server", "vmid", "name", "ip","status", "actions"]
      : ["vmid", "name", "ip","status", "actions"];
  }, [isMulti]);

  const isAdmin = user?.role === "admin" || user?.permissions?.is_admin;

  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ keyToSort: "vmid", direction: "asc" });

  const [availableServers, setAvailableServers] = useState([]);
  const [createServer, setCreateServer] = useState(server || "");
  const [actionLoading, setActionLoading] = useState({});
  const [loadingIPs, setLoadingIPs] = useState({});

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const [selectedTemplateId, setSelectedTemplateId] = useState(500);


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

  const handleCloneTemplateClick = (templateId, templateServer) => {
    // Pre-fill the template ID
    setSelectedTemplateId(templateId);
  
    // Pre-select the server where the template is located (crucial for multi-node setups)
    if (templateServer) {
      setCreateServer(templateServer);
    }
  
    // Open the modal
    setIsCreateModalOpen(true);
    };

  // ──────────────────────────────────────────────────────────────────────────

  async function createVMConfirm(payload, targetServer) {
  try {
    const response = await fetch(`${API_BASE}/server/${targetServer}/vm/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
  
    if (!response.ok) { 
      alert(`Creation error: server ${targetServer} unavailable or ID conflict.`); 
      return; 
    }
  
    const data = await response.json();
    addLog(`[Creation] VM ${payload.name} creation started on ${targetServer}`, "info");
    
    setIsCreateModalOpen(false); // Close modal on success
    if (data.task_id) {
      // Create a specific action name like "clone" so your UI doesn't block the standard start/stop buttons
      checkTaskStatus(targetServer, data.task_id, "clone", data.vmid,0);
    } else {
      // Fallback if your API doesn't return the task_id
      setTimeout(() => onRefresh(), 5000);
    }
  
  } catch (error) { 
    console.error(error);
    alert("Network error while creating the VM."); 
  }
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
        checkTaskStatus(srv, data[1], action, vmid,1);
      } else {
        addLog(`Erreur : ${data[1] || "Action refusée"}`, "error");
        setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
      }
    } catch (err) {
      addLog(`Erreur réseau : ${err.message}`, "error");
      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
    }
  }

  async function waitForIP(srv, vmid, attempts = 0) {
    const currentVmKey = `${srv}-${vmid}`;
    // Timeout de sécurité maintenu (environ 40 secondes)
    if (attempts > 10) {
      addLog(`[Network] Delai d'attente depasse pour l'IP de la VM ${vmid}`, "error");
      setLoadingIPs(prev => { const n = { ...prev }; delete n[currentVmKey]; return n; });
      onRefresh(); 
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/server/${srv}/vm/${vmid}/network`, { credentials: "include" });
    
      if (res.ok) {
        const status = await res.json();

        // NOUVEAU : On gère l'absence totale d'agent QEMU
        if (status.agent_status === "not_configured") {
          addLog(`[Network] Pas d'agent QEMU configuré sur la VM ${vmid}. Impossible d'afficher l'IP.`, "warning");
          setLoadingIPs(prev => { const n = { ...prev }; delete n[currentVmKey]; return n; });
          onRefresh(); // On rafraîchit le tableau et on arrête de chercher
          return; 
        }
      
        // Si une IP est disponible
        if (status.management_ip && status.management_ip !== "null" && status.management_ip !== "") {
          setLoadingIPs(prev => { const n = { ...prev }; delete n[currentVmKey]; return n; });
          onRefresh(); 
          return; 
        }
      
        // Si l'agent est en statut "booting", le code va simplement continuer et faire la suite (setTimeout)
      }
    } catch (err) {
      console.error("Erreur lors de la recuperation de l'IP:", err);
    }

    // On attend 4 secondes avant de réessayer
    setTimeout(() => waitForIP(srv, vmid, attempts + 1), 4000);
  }

  async function checkTaskStatus(srv, upid, action, vmid, fullLog) {
    const actionKey = `${srv}-${vmid}-${action}`;
    try {
      const res = await fetch(`${API_BASE}/server/${srv}/task/status?upid=${upid}`, { credentials: "include" });
      if (!res.ok) { 
        setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; }); 
        return; 
      }
      
      const task = await res.json();
      
      if (task[0] !== "stopped") { 
        setTimeout(() => checkTaskStatus(srv, upid, action, vmid, fullLog), 1000); 
        return; 
      }

      const res2 = await fetch(`${API_BASE}/server/${srv}/task/log?upid=${upid}`, { credentials: "include" });
      const task2 = await res2.json();

      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });

      // Si la tâche Proxmox s'est terminée sans erreur
      if (task[1] === "OK") {
        
        // Affichage du log selon le niveau de détail demandé
        if (fullLog) {
          addLog(`[Proxmox] ${action} sur VM ${vmid} : ${task2.full_log}`, "success");
        } else {
          addLog(`[Proxmox] ${action} sur VM ${vmid} : ${task2.summary}`, "success");
        }

        // Logique post-action (IP ou simple rafraîchissement)
        if (action === "start") {
          setLoadingIPs(prev => ({ ...prev, [`${srv}-${vmid}`]: true }));
          waitForIP(srv, vmid); 
        } else {
          onRefresh(); 
        }

      } else {
        // En cas d'erreur renvoyée par Proxmox
        addLog(`[Proxmox] Erreur lors de ${action} sur VM ${vmid} : ${task2.full_log}`, "error");
        onRefresh();
      }

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

  const exportToCSV = () => {
  if (selectedList.length === 0) return;

  // 1. Define the exact headers expected by the provisioning system
  const expectedHeaders = [
    "student_name", "student_firstname", "student_login", "target_host", 
    "vm_name", "template_name", "pool", "storage", "newid", 
    "net0", "net1", "ipv4", "status"
  ];

  const delimiter = ";"; 

  // 2. Create the header row
  const headerRow = expectedHeaders.join(delimiter);

  // 3. Map frontend data to the expected backend format
  const dataRows = selectedList.map(vm => {
    
    // Create a mapped object translating frontend keys to backend columns
    const mappedRow = {
      student_name: "", // Not available in frontend
      student_firstname: "", // Not available in frontend
      student_login: "", // Not available in frontend
      target_host: vm.server || "",
      vm_name: vm.name || "",
      template_name: "", // Not available in frontend
      pool: "", // Not available in frontend
      storage: "", // Not available in frontend
      newid: vm.vmid || "",
      net0: "", // Not available in frontend
      net1: "", // Not available in frontend
      ipv4: vm.ip || "",
      status: vm.status || ""
    };

    // Iterate over the expected headers and extract from the mapped object
    return expectedHeaders.map(headerKey => {
      const rawValue = String(mappedRow[headerKey] || "");
      const cleanValue = rawValue.replace(/"/g, '""');
      return `"${cleanValue}"`; 
    }).join(delimiter);
  });

  // 4. Assemble the final CSV content
  const csvContent = [headerRow, ...dataRows].join("\n");

  // 5. Add UTF-8 BOM to ensure Excel reads special characters properly
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  const dateString = new Date().toISOString().split("T")[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `export_vms_${dateString}.csv`);
  
  // 6. Trigger the download silently
  document.body.appendChild(link);
  link.click();
  
  // Clean up the DOM
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  // Assuming addLog is defined in your component
  if (typeof addLog === "function") {
    addLog(`[Export] ${selectedList.length} VMs exportées en CSV.`, "success");
  }
};

  const usernamePrefix = user?.username.split('@')[0] ? `${user?.username.split('@')[0]}-` : "";



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
          
        </div>
  
        <div className="search-row">
          <input placeholder="Rechercher une VM..." type="text"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
  
  
  

        {/* The NEW Single Create Modal */}
        <CreateVmModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={createVMConfirm}
          isMulti={isMulti}
          availableServers={availableServers}
          defaultServer={server || createServer}
          defaultTemplate={selectedTemplateId}
          defaultPool={user?.username.split('@')[0]}
          defaultName={usernamePrefix}
        />
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
          {/* Nouveau bouton Export CSV */}
          {(isAdmin || user?.permissions?.can_export_vms) && (
            <button 
              className="create-btn" 
              onClick={exportToCSV}
              style={{ backgroundColor: "#27ae60"}}>
              📥 Exporter CSV</button>
          )}

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
                <th key={h} onClick={() => handleHeaderClick(h)} style={{ cursor: "pointer",textAlign: h === "actions" ? "center" : "left" }}>
                  {/* Condition pour IP en majuscules, sinon formatage classique */}
                  {h === "ip" ? "IP" : h.charAt(0).toUpperCase() + h.slice(1)}
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
                <td>
                  {vm.template ? (
                      // It is a template: show a discreet dash
                      <span style={{ color: '#95a5a6' }}>—</span>
                      ) : loadingIPs[`${vm.server || server}-${vm.vmid}`] ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' }}>
                      <ClipLoader color="#3b82f6" size={14} />
                      <span style={{ fontSize: '0.85em', fontStyle: 'italic' }}>Recherche...</span>
                      </div>

                      ) : vm.ip && vm.ip !== "null" ? (
                      // It is a VM and has an IP: show the IP in monospace
                      <span style={{ fontWeight: '500', fontFamily: 'monospace' }}>{vm.ip}</span>
                      ) : (
                      // It is a VM but has no IP yet: show 'Non disponible'
                      <span style={{ color: '#95a5a6', fontSize: '0.9em', fontStyle: 'italic' }}>
                      Non disponible
                      </span>
                      )}
                  </td>
                  <td>
                    {vm.template ? (
                      // It is a template: explicitly show 'Template'
                      <span style={{ color: '#95a5a6', fontSize: '0.9em', fontStyle: 'italic' }}>
                      Template
                      </span>
                      ) : (
                      // It is a standard VM: show its current status (running, stopped, etc.)
                      vm.status
                      )}
                      </td>
                  <td className="vm-actions">
 
                    {!vm.template && (
                      ["start", "stop", "shutdown", "delete"].map((action) => {
                      const srv = vm.server || server;
                      const actionKey = `${srv}-${vm.vmid}-${action}`;
                      const isLoading = actionLoading[actionKey];
      
                      return (
                        <button key={action} className={`btn-${action}`} onClick={() => vmAction(vm.vmid, action, vm.server)} 
                          disabled={isLoading || Object.keys(actionLoading).some(k => k.startsWith(`${srv}-${vm.vmid}`))}
                          >
                          {isLoading ? <ClipLoader color="#ffffff" size={15} /> : action.charAt(0).toUpperCase() + action.slice(1)}
                        </button>
                      );
                      })
                    )}

                  {/* Template specific actions */}
                    {vm.template && (
                      <button 
                      className="btn-clone" 
                      onClick={() => handleCloneTemplateClick(vm.vmid, vm.server)}
                      title={`Clone template ${vm.vmid}`}
                      >
                      Clone
                      </button>
              
                    )}
                </td>
            </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}