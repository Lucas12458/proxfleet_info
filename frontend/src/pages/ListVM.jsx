import "../styles/listvm.css";
import { useState, useEffect } from "react";

export default function ListVM({ server, vms, onLogout }) {

  // Liste locale des VM
  const [vmList, setVmList] = useState(vms);

  // Création de VM
  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false);

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  // Quand le parent recharge les VM → on met à jour
  useEffect(() => {
    setVmList(vms);
  }, [vms]);

  // Recharge les VM du serveur
  async function reloadVMs() {
    const vmRes = await fetch(`${API_BASE}/server/${server}/vm`, {
      credentials: "include"
    });

    const vmData = await vmRes.json();
    setVmList(vmData);
  }

  // Création d'une VM
  async function createVMConfirm() {
    if (!vmName.trim()) return alert("Entre un nom de VM");

    // Choix du stockage selon le serveur
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

    await response.json();

    // On attend un peu que Proxmox crée la VM
    setTimeout(() => reloadVMs(), 4000);

    setVmName("");
    setShowInput(false);
  }

  // Action sur une VM (start/stop/delete)
  async function vmAction(vmid, action) {
    await fetch(
      `${API_BASE}/server/${server}/vm/${vmid}/action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action })
      }
    );

    // On attend un peu que Proxmox mette à jour l'état
    setTimeout(() => reloadVMs(), 2000);
  }

  return (
    <>
      <div className="vm-header">
        <h2 className="vm-title">VMs du serveur {server}</h2>

        {/* Bouton Logout pour CE serveur */}
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
                  <button className="btn-start" onClick={() => vmAction(vm.vmid, "start")}>Start</button>
                  <button className="btn-stop" onClick={() => vmAction(vm.vmid, "stop")}>Stop</button>
                  <button className="btn-delete" onClick={() => vmAction(vm.vmid, "delete")}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
