import "../styles/listvm.css";
import { useState } from "react";

export default function ListVM({ server, vms, onLogout }) {

  const [vmList, setVmList] = useState(vms);
  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false); // <-- IMPORTANT

  const API_BASE = "/app2/api";

  async function createVMConfirm() {
    if (!vmName.trim()) {
      alert("Entre un nom de VM");
      return;
    }
  
    try {
      const response = await fetch(`${API_BASE}/server/${server}/vm/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          newid: null,
          name: vmName,
          template: 500,
          pool: "projetinfo",
          storage: "data"
        })
      });
  
      const upid = await response.json();
      console.log("Clone lancé :", upid);
  
      // On recharge la liste des VM
      const vmRes = await fetch(`${API_BASE}/server/${server}/vm`, {
        credentials: "include"
      });
      const vmData = await vmRes.json();
      setVmList(vmData);
  
      setVmName("");
      setShowInput(false);
  
    } catch (err) {
      console.error("Erreur création VM :", err);
    }
  }
  
  

  async function vmAction(vmid, action) {
    try {
      const response = await fetch(`${API_BASE}/server/${server}/vm/${vmid}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action })
      });
  
      const result = await response.json();
      console.log("API RESULT:", result);
  
      // Recharger la liste après l'action
      const vmRes = await fetch(`${API_BASE}/server/${server}/vm`, {
        credentials: "include"
      });
      const vmData = await vmRes.json();
      setVmList(vmData);
  
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

      {/* ZONE CRÉATION VM */}
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
