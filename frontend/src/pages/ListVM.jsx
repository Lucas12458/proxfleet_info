import "../styles/listvm.css";
import { useState, useEffect } from "react";

export default function ListVM({ server, vms, onLogout, allServersData, isMulti }) {
  const header = isMulti
    ? ["server", "vmid", "name", "status", "actions"]
    : ["vmid", "name", "status", "actions"];

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ keyToSort: "name", direction: "asc" });

  const buildList = (data) => {
    if (isMulti && data) {
      return data.flatMap(srv =>
        srv.vms.map(vm => ({ ...vm, server: srv.server }))
      );
    }
    return data || [];
  };

  const [vmList, setVmList] = useState(buildList(isMulti ? allServersData : vms));

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  useEffect(() => {
    setVmList(buildList(isMulti ? allServersData : vms));
  }, [vms, allServersData, isMulti]);

  async function reloadVMs(targetServer) {
    const srv = targetServer || server;
    const res = await fetch(`${API_BASE}/server/${srv}/vm`, { credentials: "include" });
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
  }

  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [createServer, setCreateServer] = useState(server);

  const SERVERS = ["pm-serv16","pm-serv17","pm-serv18","pm-serv19","pm-serv20","pm-serv21"];

  async function createVMConfirm() {
    if (!vmName.trim()) return alert("Entre un nom de VM");

    const targetServer = isMulti ? createServer : server;
    const storageName = (targetServer === "pm-serv18" || targetServer === "pm-serv19") ? "data2" : "data";

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

    await response.json();
    setTimeout(() => reloadVMs(targetServer), 4000);
    setVmName("");
    setShowInput(false);
  }

  async function vmAction(vmid, action, targetServer) {
    const srv = targetServer || server;
    await fetch(`${API_BASE}/server/${srv}/vm/${vmid}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action })
    });
    setTimeout(() => reloadVMs(srv), 2000);
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

  // Flèche de tri simple, sans composant externe
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
                  {SERVERS.map(s => <option key={s} value={s}>{s}</option>)}
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