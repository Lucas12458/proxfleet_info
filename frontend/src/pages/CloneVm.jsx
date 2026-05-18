// CloneVm.jsx
// Modale pour cloner un template de VM (single VM clone modal).
// Permet de configurer une nouvelle VM : nom, ID, template, pool, stockage, serveur cible.
// Automatically fetches compatible storages when a server is selected.

import { useState, useEffect } from "react";
import PropTypes from 'prop-types';
import "../styles/cloneVm.css";

const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

// Props:
//   - isOpen : si la modale est visible
//   - onClose : callback pour fermer
//   - onSubmit : callback avec (payload, targetServer) à la confirmation
//   - isMulti : si plusieurs serveurs sont disponibles (shows server selector)
//   - availableServers : liste des hostnames de serveurs
//   - defaultServer : serveur pré-sélectionné
//   - defaultTemplate : ID de template pré-rempli
//   - defaultPool : nom de pool pré-rempli
//   - defaultName : préfixe du nom de VM pré-rempli
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
  const [availableStorages, setAvailableStorages] = useState([]); // Stockages compatibles avec les images VM
  const [loadingStorage, setLoadingStorage] = useState(false);

  // État du formulaire
  const [params, setParams] = useState({
    name: defaultName || "",
    newid: "",             // Optionnel — leave empty for auto-assignment
    template: defaultTemplate || 500,
    pool: defaultPool || "",
    storage: ""
  });

  // Réinitialise le formulaire à chaque ouverture de la modale
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

  // Récupère les stockages compatibles whenever the target server changes
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
          
          // Garde uniquement les stockages activés qui supportent les images VM
          const validStorages = data.filter(s => !s.disable && s.content?.includes("images"));
          setAvailableStorages(validStorages);

          if (validStorages.length > 0) {
            // Ordre de priorité des stockages préférés
            const priorityList = ["data2", "data"];
            
            const preferredStorage = priorityList.find(name => 
              validStorages.some(s => s.storage === name)
            );

            setParams(prev => {
              // Garde la sélection courante si encore valide — otherwise pick preferred or first
              const isCurrentValid = validStorages.some(s => s.storage === prev.storage);
              const nextStorage = preferredStorage || (isCurrentValid ? prev.storage : validStorages[0].storage);

              return { ...prev, storage: nextStorage };
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

  // Met à jour un champ du formulaire
  const handleChange = (e) => {
    const { name, value } = e.target;
    setParams(prev => ({ ...prev, [name]: value }));
  };

  // Valide et soumet le formulaire
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
      newid: params.newid ? Number(params.newid) : null // null = auto-assign ID
    };

    onSubmit(payload, targetServer);
  };

  return (
    <div className="modal-overlay">
      <div className="clone-container">
        <h3>Cloner un template</h3>
        
        <div className="modal-body">
          
          {/* Sélecteur de serveur — only shown in multi-server mode */}
          {isMulti && (
            <div className="form-group">
              <label htmlFor="target-server-select">Choix du serveur</label>
              <select id="target-server-select" value={targetServer} onChange={e => setTargetServer(e.target.value)} className="create-input">
                {availableServers.length > 0 ? (
                  availableServers.map(s => <option key={s} value={s}>{s}</option>)
                ) : (
                  <option value="">Loading servers...</option>
                )}
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="vm-name">Nom de la VM (Requis)</label>
            <input id="vm-name" type="text" name="name" value={params.name} onChange={handleChange} className="create-input" placeholder="e.g., web-server-01" />
          </div>

          <div className="form-group">
            <label htmlFor="vm-id-input">ID (Laisser vide pour une sélection automatique)</label>
            <input id="vm-id-input" type="number" name="newid" value={params.newid} onChange={handleChange} className="create-input" placeholder="e.g., 150" />
          </div>

          <div className="form-group">
            <label htmlFor="template-id-input">ID du template</label>
            <input id="template-id-input" type="number" name="template" value={params.template} onChange={handleChange} className="create-input" />
          </div>

          <div className="form-group">
            <label htmlFor="pool-input">Pool</label>
            <input id="pool-input" type="text" name="pool" value={params.pool} onChange={handleChange} className="create-input" />
          </div>

          {/* Sélecteur de stockage — populated dynamically from the selected server */}
          <div className="form-group">
            <label htmlFor="storage-select">Stockage</label>
            <select 
              id="stockage-select"
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
                  <option key={s.storage} value={s.storage}>{s.storage}</option>
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

CreateVmModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func, 
  onSubmit: PropTypes.func,
  isMulti: PropTypes.bool,
  availableServers: PropTypes.array,
  defaultServer: PropTypes.string,
  defaultTemplate: PropTypes.number,
  defaultPool: PropTypes.string,
  defaultName: PropTypes.string,
};
