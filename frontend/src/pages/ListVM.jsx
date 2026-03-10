import "../styles/listvm.css";
import { useState, useEffect } from "react";

export default function ListVM({ server, vms, onLogout, allServersData, isMulti }) {
  const header = isMulti
    ? ["server", "vmid", "name", "status", "actions"]
    : ["vmid", "name", "status", "actions"];

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ keyToSort: "name", direction: "asc" });
  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false);

  // Serveurs disponibles chargés depuis l'API
  const [availableServers, setAvailableServers] = useState([]);
  const [createServer, setCreateServer] = useState(server || "");

  // Charge la liste des serveurs disponibles depuis /api/servers
  useEffect(() => {
    async function fetchServers() {
      try {
        const res = await fetch(`${API_BASE}/servers`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const hosts = data.map(s => s.host);
        setAvailableServers(hosts);
        // Si pas de serveur sélectionné, prendre le premier disponible
        if (!server && hosts.length > 0) {
          setCreateServer(hosts[0]);
        }
      } catch {
        // Silencieux, on garde la liste vide
      }
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

  // Recharge les VM — avec try/catch pour éviter la page blanche
  async function reloadVMs(targetServer) {
    const srv = targetServer || server;
    if (!srv) return;

    try {
      const res = await fetch(`${API_BASE}/server/${srv}/vm`, { credentials: "include" });
      if (!res.ok) return; // serveur indispo → on ignore silencieusement

      const data = await res.json();

      if (isMulti) {
        setVmList(prev =>
          prev
            .filter(vm => vm.server !== srv)
            .concat(data.map(vm => ({ ...vm, server: srv })))
        );
      } else {
        setVmList(data);
      }
    } catch {
      // Serveur indispo → pas de crash, page reste affichée
    }
  }

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
      setTimeout(() => reloadVMs(targetServer), 4000);
    } catch {
      alert("Erreur réseau lors de la création de la VM");
    }

    setVmName("");
    setShowInput(false);
  }

  async function vmAction(vmid, action, targetServer) {
    const srv = targetServer || server;
    if (!srv) return;

    try {
      const res = await fetch(`${API_BASE}/server/${srv}/vm/${vmid}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action })
      });

      if (!res.ok) {
        alert(`Action impossible : serveur ${srv} indisponible`);
        return;
      }

      setTimeout(() => reloadVMs(srv), 2000);
    } catch {
      alert("Erreur réseau");
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
        <div className="create-side">
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