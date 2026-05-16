// ListVM.jsx
// Composant principal qui affiche le tableau des VMs avec tri, filtrage et actions groupées.
// Handles all VM lifecycle actions : démarrer, arrêter, supprimer, cloner.
// Interroge le statut des tâches and polls for IP availability after starting a VM.
// Inclut également la modale d'édition réseau (EditNetworkModal) — new in this version.
// Also handles CSV export of selected VMs.

import "../styles/listvm.css";
import { useState, useMemo, useEffect } from 'react';
import { ClipLoader } from "react-spinners";
import { CreateVmModal } from "./CloneVm";
import { EditNetworkModal } from "./EditNetworkModal";
import PropTypes from 'prop-types';

const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

// Props:
//   - server : hostname du serveur (null en mode multi)
//   - vms : tableau de VMs pour le mode mono-serveur
//   - allServersData : tableau de { server, vms } pour le mode multi-serveur
//   - isMulti : si plusieurs serveurs sont affichés
//   - onRefresh : callback pour recharger les données depuis le parent
//   - addLog : callback to add entries to the activity console
//   - user : l'utilisateur connecté
export default function ListVM({ server, vms, allServersData, isMulti, onRefresh, addLog, user }) {
  // En-têtes du tableau — adds a "server" column in multi-server mode
  const header = useMemo(() => {
    return isMulti
      ? ["server", "vmid", "name", "ip", "status", "actions"]
      : ["vmid", "name", "ip", "status", "actions"];
  }, [isMulti]);

  const isAdmin = user?.role === "admin" || user?.permissions?.is_admin;

  // État du tableau (table state)
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ keyToSort: "vmid", direction: "asc" });

  // État des serveurs et modales
  const [availableServers, setAvailableServers] = useState([]);
  const [createServer, setCreateServer] = useState(server || "");
  const [actionLoading, setActionLoading] = useState({}); // Suit les actions VM en cours
  const [loadingIPs, setLoadingIPs] = useState({});       // Suit les VMs en attente d'IP

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(500);

  // État de la modale d'édition réseau (new in this version)
  const [isNetModalOpen, setIsNetModalOpen] = useState(false);
  const [selectedVmForNet, setSelectedVmForNet] = useState(null); // VM dont on édite le réseau

  // Sélection multiple pour les actions groupées (multi-selection state)
  const [selectedVMs, setSelectedVMs] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Récupère la liste des serveurs disponibles for the clone modal's server selector
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

  // Aplatit les données multi-serveurs en une seule liste — or use the single-server array
  const vmList = useMemo(() => {
    const data = isMulti ? allServersData : vms;
    if (isMulti && data) {
      return data.flatMap(srv => srv.vms.map(vm => ({ ...vm, server: srv.server })));
    }
    return data || [];
  }, [isMulti, allServersData, vms]);

  // Applique la recherche, les filtres par colonne et le tri
  const filtered = useMemo(() => {
    // Étape 1 : filtrage
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

    // Étape 2 : tri (sorting)
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
  }, [vmList, search, header, filters, sort]);

  // Génère une clé unique pour chaque VM combinant serveur et vmid
  const vmKey = (vm) => `${vm.server || server}-${vm.vmid}`;

  // Toggle la sélection d'une VM individuelle
  const toggleSelect = (vm) => {
    setSelectedVMs(prev => {
      const next = new Set(prev);
      next.has(vmKey(vm)) ? next.delete(vmKey(vm)) : next.add(vmKey(vm));
      return next;
    });
  };

  // Sélectionne ou désélectionne toutes les VMs visibles
  const toggleSelectAll = () => {
    if (selectedVMs.size === filtered.length) {
      setSelectedVMs(new Set());
    } else {
      setSelectedVMs(new Set(filtered.map(vmKey)));
    }
  };

  const selectedList = filtered.filter(vm => selectedVMs.has(vmKey(vm)));

  // Exécute une action sur toutes les VMs sélectionnées in parallel
  async function bulkAction(action) {
    if (selectedList.length === 0) return;
    setBulkLoading(true);
    await Promise.all(selectedList.map(vm => vmAction(vm.vmid, action, vm.server)));
    setBulkLoading(false);
    setSelectedVMs(new Set());
  }

  // Pré-remplit la modale de clonage when clicking "Clone" on a template row
  const handleCloneTemplateClick = (templateId, templateServer) => {
    setSelectedTemplateId(templateId);
    if (templateServer) setCreateServer(templateServer);
    setIsCreateModalOpen(true);
  };

  // Ouvre la modale d'édition réseau pour une VM spécifique (new in this version)
  const handleEditNetworkClick = (vm) => {
    setSelectedVmForNet(vm);
    setIsNetModalOpen(true);
  };

  // Envoie une requête de clonage de VM au backend
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
      setIsCreateModalOpen(false);

      if (data.task_id) {
        // Surveille la tâche via le task ID retourné
        checkTaskStatus(targetServer, data.task_id, "clone", data.vmid, 0);
      } else {
        setTimeout(() => onRefresh(), 5000); // Fallback refresh si pas de task_id
      }

    } catch (error) {
      console.error(error);
      alert("Network error while creating the VM.");
    }
  }

  // Envoie une action de cycle de vie (start/stop/shutdown/delete) à une VM spécifique
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
        checkTaskStatus(srv, data[1], action, vmid, 1);
      } else {
        addLog(`Erreur : ${data[1] || "Action refusée"}`, "error");
        setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
      }
    } catch (err) {
      addLog(`Erreur réseau : ${err.message}`, "error");
      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
    }
  }

  // Interroge /network toutes les 4 secondes until a management IP is available.
  // Timeout après ~40 secondes (30 tentatives × ~4s).
  async function waitForIP(srv, vmid, attempts = 0) {
    const currentVmKey = `${srv}-${vmid}`;

    if (attempts > 30) {
      // Timeout : on arrête d'attendre l'IP
      addLog(`[Network] Delai d'attente depasse pour l'IP de la VM ${vmid}`, "error");
      setLoadingIPs(prev => { const n = { ...prev }; delete n[currentVmKey]; return n; });
      onRefresh();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/server/${srv}/vm/${vmid}/network`, { credentials: "include" });

      if (res.ok) {
        const status = await res.json();

        // Agent QEMU non configuré — stop polling and refresh
        if (status.agent_status === "not_configured") {
          addLog(`[Network] Pas d'agent QEMU configuré sur la VM ${vmid}. Impossible d'afficher l'IP.`, "warning");
          setLoadingIPs(prev => { const n = { ...prev }; delete n[currentVmKey]; return n; });
          onRefresh();
          return;
        }

        // IP trouvée — refresh the table to display it
        if (status.management_ip && status.management_ip !== "null" && status.management_ip !== "") {
          await onRefresh();
          setLoadingIPs(prev => { const n = { ...prev }; delete n[currentVmKey]; return n; });
          return;
        }
        // Agent en démarrage — on continue le polling
      }
    } catch (err) {
      console.error("Erreur lors de la recuperation de l'IP:", err);
    }

    // Retry after 4 seconds
    setTimeout(() => waitForIP(srv, vmid, attempts + 1), 4000);
  }

  // Surveille une tâche Proxmox jusqu'à completion — then handles post-action logic
  async function checkTaskStatus(srv, upid, action, vmid, fullLog) {
    const actionKey = `${srv}-${vmid}-${action}`;
    try {
      const res = await fetch(`${API_BASE}/server/${srv}/task/status?upid=${upid}`, { credentials: "include" });
      if (!res.ok) {
        setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
        return;
      }

      const task = await res.json();

      // Tâche encore en cours — retry in 1 second
      if (task[0] !== "stopped") {
        setTimeout(() => checkTaskStatus(srv, upid, action, vmid, fullLog), 1000);
        return;
      }

      // Tâche terminée — fetch the logs
      const res2 = await fetch(`${API_BASE}/server/${srv}/task/log?upid=${upid}`, { credentials: "include" });
      const task2 = await res2.json();

      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });

      if (task[1] === "OK") {
        // Log détaillé pour les actions manuelles, résumé pour les automatiques
        if (fullLog) {
          addLog(`[Proxmox] ${action} sur VM ${vmid} : ${task2.full_log}`, "success");
        } else {
          addLog(`[Proxmox] ${action} sur VM ${vmid} : ${task2.summary}`, "success");
        }

        if (action === "start") {
          // Après démarrage — begin polling for the VM's IP address
          setLoadingIPs(prev => ({ ...prev, [`${srv}-${vmid}`]: true }));
          waitForIP(srv, vmid);
        } else {
          onRefresh(); // Pour toutes les autres actions, refresh le tableau
        }

      } else {
        addLog(`[Proxmox] Erreur lors de ${action} sur VM ${vmid} : ${task2.full_log}`, "error");
        onRefresh();
      }

    } catch (err) {
      console.error(err);
      setActionLoading(prev => { const n = { ...prev }; delete n[actionKey]; return n; });
    }
  }

  // Toggle la direction du tri au clic sur un en-tête de colonne
  function handleHeaderClick(h) {
    setSort({ keyToSort: h, direction: h === sort.keyToSort ? (sort.direction === "asc" ? "desc" : "asc") : "asc" });
  }

  const allSelected = filtered.length > 0 && selectedVMs.size === filtered.length;

  // Exporte les VMs sélectionnées en CSV — format attendu par le backend de provisionnement
  const exportToCSV = () => {
    if (selectedList.length === 0) return;

    const expectedHeaders = [
      "student_name", "student_firstname", "student_login", "target_host",
      "vm_name", "template_name", "pool", "storage", "newid",
      "net0", "net1", "ipv4", "status"
    ];

    const delimiter = ";";
    const headerRow = expectedHeaders.join(delimiter);

    // Mappe les données frontend vers le format CSV attendu par le backend
    const dataRows = selectedList.map(vm => {
      const mappedRow = {
        student_name: "",        // Non disponible côté frontend
        student_firstname: "",   // Non disponible côté frontend
        student_login: "",       // Non disponible côté frontend
        target_host: vm.server || "",
        vm_name: vm.name || "",
        template_name: "",       // Non disponible côté frontend
        pool: "",                // Non disponible côté frontend
        storage: "",             // Non disponible côté frontend
        newid: vm.vmid || "",
        net0: "",                // Non disponible côté frontend
        net1: "",                // Non disponible côté frontend
        ipv4: vm.ip || "",
        status: vm.status || ""
      };

      return expectedHeaders.map(headerKey => {
        const rawValue = String(mappedRow[headerKey] || "");
        const cleanValue = rawValue.replaceAll('"', '""'); // Échappe les guillemets
        return `"${cleanValue}"`;
      }).join(delimiter);
    });

    const csvContent = [headerRow, ...dataRows].join("\n");

    // Ajoute le BOM UTF-8 pour qu'Excel lise correctement les caractères spéciaux
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateString = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `export_vms_${dateString}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof addLog === "function") {
      addLog(`[Export] ${selectedList.length} VMs exportées en CSV.`, "success");
    }
  };

  // Extrait le préfixe du username (avant @) to pre-fill the VM name field
  const usernamePrefix = user?.username.split('@')[0] ? `${user?.username.split('@')[0]}-` : "";

  return (
    <>
      {/* En-tête breadcrumb — shows current view (single server or global) */}
      <div className="vm-header breadcrumb-header">
        <div className="breadcrumb">
          <span className="breadcrumb-path">Machines Virtuelles</span>
          <span className="breadcrumb-separator">/</span>
          <h2 className="breadcrumb-current">
            {isMulti ? "Vue globale" : server}
          </h2>
        </div>
      </div>

      {/* Barre d'outils : bouton refresh, recherche, modales */}
      <div className="toolbar-row">
        <div className="create-side">
          <button className="create-btn" onClick={onRefresh}>🔄 Refresh</button>
        </div>

        <div className="search-row">
          <input placeholder="Rechercher une VM..." type="text"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Modale de clonage — pre-filled with user's pool and name prefix */}
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

        {/* Modale d'édition réseau — rendered here to stay outside the table DOM */}
        {isNetModalOpen && (
          <EditNetworkModal
            isOpen={isNetModalOpen}
            onClose={() => setIsNetModalOpen(false)}
            server={selectedVmForNet?.server || server}
            vmid={selectedVmForNet?.vmid}
            currentInterfaces={selectedVmForNet?.interfaces || []}
            onSuccess={onRefresh} // Refresh la liste après sauvegarde
          />
        )}
      </div>

      {/* Barre d'actions groupées — appears when at least one VM is selected */}
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
          {/* Bouton export CSV — only for admins or users with can_export_vms permission */}
          {(isAdmin || user?.permissions?.can_export_vms) && (
            <button
              className="create-btn"
              onClick={exportToCSV}
              style={{ backgroundColor: "#27ae60" }}>
              📥 Exporter CSV
            </button>
          )}
          <button className="create-btn" onClick={() => setSelectedVMs(new Set())}>✕ Désélectionner</button>
        </div>
      )}

      {/* Tableau des VMs (VM Table) */}
      <div className="vm-table-wrapper">
        <table className="vm-table">
          <thead>
            <tr>
              {/* Checkbox "tout sélectionner" (select-all checkbox) */}
              <th style={{ width: 36, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  title="Tout sélectionner"
                />
              </th>
              {/* En-têtes de colonnes triables (sortable column headers) */}
              {header.map(h => (
                <th key={h} onClick={() => handleHeaderClick(h)} style={{ cursor: "pointer", textAlign: h === "actions" ? "center" : "left" }}>
                  {h === "ip" ? "IP" : h.charAt(0).toUpperCase() + h.slice(1)}
                  <Arrow col={h} sort={sort} />
                </th>
              ))}
              {/* Bouton toggle des filtres */}
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

            {/* Ligne d'inputs de filtre par colonne */}
            {showFilters && (
              <tr className="filter-row">
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
                    // Les templates n'ont pas d'IP
                    <span style={{ color: '#95a5a6' }}>—</span>
                  ) : loadingIPs[`${vm.server || server}-${vm.vmid}`] ? (
                    // IP en cours de récupération — show spinner
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' }}>
                      <ClipLoader color="#3b82f6" size={14} />
                      <span style={{ fontSize: '0.85em', fontStyle: 'italic' }}>Recherche...</span>
                    </div>
                  ) : vm.ip && vm.ip !== "null" ? (
                    // IP disponible — display it
                    <span style={{ fontWeight: '500', fontFamily: 'monospace' }}>{vm.ip}</span>
                  ) : (
                    // VM démarrée mais IP pas encore disponible
                    <span style={{ color: '#95a5a6', fontSize: '0.9em', fontStyle: 'italic' }}>
                      Non disponible
                    </span>
                  )}
                </td>
                <td>
                  {vm.template ? (
                    <span style={{ color: '#95a5a6', fontSize: '0.9em', fontStyle: 'italic' }}>Template</span>
                  ) : (
                    vm.status
                  )}
                </td>
                <td className="vm-actions">
                  {/* Actions pour les VMs classiques */}
                  {!vm.template && (
                    <>
                      {["start", "stop", "shutdown", "delete"].map((action) => {
                        const srv = vm.server || server;
                        const actionKey = `${srv}-${vm.vmid}-${action}`;
                        const isLoading = actionLoading[actionKey];

                        return (
                          <button
                            key={action}
                            className={`btn-${action}`}
                            onClick={() => vmAction(vm.vmid, action, vm.server)}
                            disabled={isLoading || Object.keys(actionLoading).some(k => k.startsWith(`${srv}-${vm.vmid}`))}
                            aria-label={`${action.charAt(0).toUpperCase() + action.slice(1)} VM ${vm.vmid}`}
                          >
                            {isLoading ? <ClipLoader color="#ffffff" size={15} /> : action.charAt(0).toUpperCase() + action.slice(1)}
                          </button>
                        );
                      })}

                      {/* Bouton Réseau — opens the EditNetworkModal for this VM (new in this version) */}
                      <button
                        className="btn-network"
                        onClick={() => handleEditNetworkClick(vm)}
                        title="Modifier les interfaces réseau"
                        aria-label={`Modifier le réseau de la VM ${vm.vmid}`}
                        disabled={Object.keys(actionLoading).some(k => k.startsWith(`${vm.server || server}-${vm.vmid}`))}
                      >
                        Réseau
                      </button>
                    </>
                  )}

                  {/* Action spécifique aux templates : bouton Clone */}
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

// Petit composant helper pour afficher la flèche de tri sur les en-têtes de colonnes
const Arrow = ({ col, sort }) => {
  if (sort.keyToSort !== col) return null;
  return <span style={{ marginLeft: 4 }}>{sort.direction === "asc" ? "▲" : "▼"}</span>;
};

Arrow.propTypes = {
  col: PropTypes.string.isRequired,
  sort: PropTypes.shape({
    keyToSort: PropTypes.string,
    direction: PropTypes.string
  }).isRequired
};

ListVM.propTypes = {
  addLog: PropTypes.func,
  allServersData: PropTypes.array,
  isMulti: PropTypes.bool,
  onRefresh: PropTypes.func,
  server: PropTypes.string,
  user: PropTypes.object,
  vms: PropTypes.array,
};
