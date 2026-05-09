import { useState, useEffect } from "react";
import "../styles/cloneVm.css";

// Ensure API_BASE is defined for the fetch requests
const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

export function CreateVmModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isMulti, 
  availableServers, 
  defaultServer,
  defaultTemplate,
  defaultPool,
  defaultName
}) {
  const [targetServer, setTargetServer] = useState(defaultServer || "");
  const [availableStorages, setAvailableStorages] = useState([]);
  const [loadingStorage, setLoadingStorage] = useState(false);

  const [params, setParams] = useState({
    name: defaultName || "",
    newid: "",
    template: defaultTemplate || 500,
    pool: defaultPool || "",
    storage: ""
  });

  // 1. Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setParams({
       name: defaultName || "",
        newid: "",
        template: defaultTemplate || 500,
        pool: defaultPool || "",
        storage: ""
      });
      setTargetServer(defaultServer || "");
    }
  }, [isOpen, defaultServer, defaultTemplate, defaultPool, defaultName]);

  // 2. Fetch and filter storage whenever the target server changes
  useEffect(() => {
    if (!isOpen || !targetServer) return;

    const fetchStorage = async () => {
      setLoadingStorage(true);
      try {
        const response = await fetch(`${API_BASE}/server/${targetServer}/storage`, {
          method: "GET",
          credentials: "include"
        });

        if (response.ok) {
          const data = await response.json();
          
          // Filter out storages that do not support VM disk images
          const validStorages = data.filter(s => !s.disable &&s.content && s.content.includes("images"));
          setAvailableStorages(validStorages);

          // Automatically select the first valid storage if current selection is empty or invalid
          if (validStorages.length > 0) {
            const priorityList = ["data2", "data"];
            
            const preferredStorage = priorityList.find(name => 
              validStorages.some(s => s.storage === name)
            );

            setParams(prev => {
              // 1. Vérifier si le stockage actuellement sélectionné est toujours valide
              const isCurrentValid = validStorages.some(s => s.storage === prev.storage);
              
              // 2. Définir le prochain stockage dans l'ordre : 
              // Préféré > Actuel (si valide) > Le premier de la liste
              const nextStorage = preferredStorage || (isCurrentValid ? prev.storage : validStorages[0].storage);

              return {
                ...prev,
                storage: nextStorage
              };
              });
          } else {
            setParams(prev => ({ ...prev, storage: "" }));
          }
        }
      } catch (error) {
        console.error("Failed to fetch storages:", error);
      } finally {
        setLoadingStorage(false);
      }
    };

    fetchStorage();
  }, [isOpen, targetServer]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setParams(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!params.name.trim()) {
      alert("Please enter a VM name.");
      return;
    }
    if (!targetServer) {
      alert("No server selected.");
      return;
    }
    if (!params.storage) {
      alert("No valid storage available for this server.");
      return;
    }

    const payload = {
      name: params.name,
      template: Number(params.template),
      pool: params.pool,
      storage: params.storage,
      newid: params.newid ? Number(params.newid) : null
    };

    onSubmit(payload, targetServer);
  };

  return (
    <div className="modal-overlay">
      <div className="clone-container">
        <h3>Cloner un template</h3>
        
        <div className="modal-body">
          
          {isMulti && (
            <div className="form-group">
              <label>Target Server</label>
              <select value={targetServer} onChange={e => setTargetServer(e.target.value)} className="create-input">
                {availableServers.length > 0 ? (
                  availableServers.map(s => <option key={s} value={s}>{s}</option>)
                ) : (
                  <option value="">Loading servers...</option>
                )}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Nom de la VM (Requis)</label>
            <input type="text" name="name" value={params.name} onChange={handleChange} className="create-input" placeholder="e.g., web-server-01" />
          </div>

          <div className="form-group">
            <label>ID (Laisser vide pour une sélection automatique)</label>
            <input type="number" name="newid" value={params.newid} onChange={handleChange} className="create-input" placeholder="e.g., 150" />
          </div>

          <div className="form-group">
            <label>ID du template</label>
            <input type="number" name="template" value={params.template} onChange={handleChange} className="create-input" />
          </div>

          <div className="form-group">
            <label>Pool</label>
            <input type="text" name="pool" value={params.pool} onChange={handleChange} className="create-input" />
          </div>

          <div className="form-group">
            <label>Stockage</label>
            <select 
              name="storage" 
              value={params.storage} 
              onChange={handleChange} 
              className="create-input"
              disabled={loadingStorage || availableStorages.length === 0}
            >
              {loadingStorage ? (
                <option value="">Loading storages...</option>
              ) : availableStorages.length > 0 ? (
                availableStorages.map(s => (
                  <option key={s.storage} value={s.storage}>
                    {s.storage}
                  </option>
                ))
              ) : (
                <option value="">No compatible storage found</option>
              )}
            </select>
          </div>

        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>Annuler</button>
          <button 
            className="confirm-btn create-btn" 
            onClick={handleSubmit}
            disabled={loadingStorage || availableStorages.length === 0}
          >
            Cloner le template
          </button>
        </div>
      </div>
    </div>
  );
}