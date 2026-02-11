import "../styles/listvm.css";

export default function ListVM({ server, vms }) {

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
    <div className="vm-container">
      <h2>VMs du serveur {server}</h2>

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
          {vms.map(vm => (
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
  );
}
