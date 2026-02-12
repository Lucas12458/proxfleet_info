import "../styles/listvm.css";
import { useState } from "react";

export default function ListVM({ server, vms, onLogout }) {

  const [vmList, setVmList] = useState(vms);
  const [vmName, setVmName] = useState("");
  const [showInput, setShowInput] = useState(false); // <-- IMPORTANT

  async function createVMConfirm() {
    if (!vmName.trim()) {
      alert("Entre un nom de VM");
      return;
    }

    try {
      const response = await fetch(`/server/${server}/vm/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newid: null,
          name: vmName,
          template: 123,
          pool: "default",
          storage: "local-lvm"
        })
      });

      const newVM = await response.json();

      setVmList(prev => [...prev, newVM]);
      setVmName("");
      setShowInput(false); // on referme le formulaire

    } catch (err) {
      console.error("Erreur création VM :", err);
    }
  }

  function startVM(vmid) {
    console.log("Start VM", vmid);
  }

  function stopVM(vmid) {
    console.log("Stop VM", vmid);
  }

  function deleteVM(vmid) {
    console.log("Delete VM", vmid);
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
