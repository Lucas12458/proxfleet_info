import "../styles/listvm.css";
import { useState, useEffect } from "react";

export default function ListVM({ server, vms, onLogout }) {

  // Liste locale des VM (source affichée)
  const [vmList, setVmList] = useState(vms);

  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false);

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  /**
   * IMPORTANT :
   * Si le parent recharge les VM (refresh / changement serveur),
   * on synchronise la liste locale.
   */
  useEffect(() => {
    setVmList(vms);
  }, [vms]);

  async function reloadVMs() {
    const vmRes = await fetch(
      `${API_BASE}/server/${server}/vm`,
      { credentials: "include" }
    );

    const vmData = await vmRes.json();
    setVmList(vmData);
  }

  async function createVMConfirm() {
    if (!vmName.trim()) {
      alert("Entre un nom de VM");
      return;
    }

    try {
      let storageName = "data"; 
      if (server === "pm-serv18" || server === "pm-serv19") { 
        storageName = "data2"; 
      }
      const response = await fetch(
        `${API_BASE}/server/${server}/vm/clone`,
        {
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
        }
      );

      const upid = await response.json();
      console.log("Clone lancé :", upid);

      // attendre un peu que Proxmox crée la VM
      setTimeout(() => {
        reloadVMs();
      }, 4000);

      setVmName("");
      setShowInput(false);

    } catch (err) {
      console.error("Erreur création VM :", err);
    }
  }

  async function vmAction(vmid, action) {
    try {
      const response = await fetch(
        `${API_BASE}/server/${server}/vm/${vmid}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action })
        }
      );

      const result = await response.json();
      console.log("API RESULT:", result);

      setTimeout(() => {
        reloadVMs();
      }, 2000);

    } catch (err) {
      console.error("Erreur API action VM :", err);
    }
  }

  function startVM(vmid) {
    vmAction(vmid, "start");
  }

  function stopVM(vmid) {
    vmAction(vmid, "stop");
  }

  function deleteVM(vmid) {
    vmAction(vmid, "delete");
  }

  return (
    <>
      <div className="vm-header">
        <h2 className="vm-title">VMs du serveur {server}</h2>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </div>

      <div className="create-row">

        {!showInput && (
          <button className="create-btn" onClick={() => setShowInput(true)}>
            Créer VM
          </button>
        )}

        {showInput && (
          <>
            <input
              type="text"
              className="create-input"
              placeholder="Nom de la VM"
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
            />
            <button className="create-btn" onClick={createVMConfirm}>
              Confirmer
            </button>
          </>
        )}

      </div>

      <div className="vm-table-wrapper">
        <table className="vm-table">
          <thead>
            <tr>
              <th>VMID</th>
              <th>Nom</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {vmList.map(vm => (
              <tr key={vm.vmid}>
                <td>{vm.vmid}</td>
                <td>{vm.name}</td>
                <td>{vm.status}</td>
                <td className="vm-actions">
                  <button className="btn-start" onClick={() => startVM(vm.vmid)}>Start</button>
                  <button className="btn-stop" onClick={() => stopVM(vm.vmid)}>Stop</button>
                  <button className="btn-delete" onClick={() => deleteVM(vm.vmid)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
