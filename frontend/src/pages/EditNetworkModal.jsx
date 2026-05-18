// EditNetworkModal.jsx
// Nouvelle modale pour modifier les interfaces réseau d'une VM (network edit modal).
// Affiche toutes les interfaces (net0, net1...) de la VM avec un accordéon par interface.
// Allows changing the bridge, VLAN tag, and MAC address for each network interface.
// Fetches available bridges from the server and VM interfaces from the backend.

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import "../styles/editNetwork.css";

const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

// Props:
//   - isOpen : si la modale est visible
//   - onClose : callback pour fermer la modale
//   - server : hostname du serveur Proxmox
//   - vmid : ID de la VM dont on modifie le réseau
//   - currentInterfaces : interfaces déjà connues (passed from parent to avoid re-fetch)
//   - onSuccess : callback appelé après une sauvegarde réussie (triggers a refresh)
export function EditNetworkModal({ isOpen, onClose, server, vmid, currentInterfaces: initialInterfaces, onSuccess }) {
  const [interfaces, setInterfaces] = useState([]);          // Interfaces réseau de la VM
  const [availableBridges, setAvailableBridges] = useState([]); // Bridges disponibles sur le serveur
  const [formData, setFormData] = useState({});              // Données du formulaire par interface
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Contrôle quel accordéon d'interface est ouvert (accordion state)
  const [expandedInterface, setExpandedInterface] = useState(null);

  // Charge les bridges et les interfaces réseau à l'ouverture de la modale
  useEffect(() => {
    if (!isOpen) {
      setExpandedInterface(null); // Referme tous les accordéons à la fermeture
      return;
    }

    // AbortController pour annuler les requêtes si la modale se ferme pendant le chargement
    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        // Étape 1 : Récupère tous les bridges disponibles sur le serveur
        const bridgeRes = await fetch(`${API_BASE}/server/${server}/interfaces?vlan=all`, {
          signal: controller.signal
        });
        const bridgesData = await bridgeRes.json();
        // Normalise les données des bridges (different possible field names)
        const formattedBridges = bridgesData.map(b => ({
          iface: b.iface || b.name || b,
          active: b.active === 1 || b.active === true || b.active === '1',
          comments: b.comments || b.comment || ""
        }));
        setAvailableBridges(formattedBridges);

        // Étape 2 : Récupère les interfaces de la VM — uses passed interfaces if available
        let vmInterfaces = initialInterfaces;
        if (!vmInterfaces || vmInterfaces.length === 0) {
          const InterfaceRes = await fetch(`${API_BASE}/server/${server}/vm/${vmid}/network`, {
            signal: controller.signal
          });
          const InterfaceData = await InterfaceRes.json();
          vmInterfaces = Object.entries(InterfaceData.interfaces || {}).map(([id, info]) => ({
            id, ...info
          }));
        }
        setInterfaces(vmInterfaces);

        // Initialise le formulaire avec les valeurs actuelles de chaque interface
        const initialForm = {};
        vmInterfaces.forEach(Interface => {
          initialForm[Interface.id] = {
            bridge: Interface.bridge || "",
            tag: Interface.tag || "",
            mac: Interface.mac || ""
          };
        });
        setFormData(initialForm);
        
        // Auto-ouvre l'accordéon s'il n'y a qu'une seule interface
        if (vmInterfaces.length === 1) {
          setExpandedInterface(vmInterfaces[0].id);
        }

      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();
    // Cleanup : annule les requêtes en cours si le composant est démonté
    return () => controller.abort();
  }, [isOpen, server, vmid, initialInterfaces]);

  // Met à jour un champ du formulaire pour une interface spécifique
  const handleChange = (netId, field, value) => {
    setFormData(prev => ({
      ...prev,
      [netId]: { ...prev[netId], [field]: value }
    }));
  };

  // Soumet les modifications — only sends requests for interfaces that actually changed
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Envoie une requête PUT uniquement pour les interfaces modifiées
      const updatePromises = interfaces.map(Interface => {
        const updatedConfig = formData[Interface.id];
        // Skip si bridge et tag n'ont pas changé
        if (updatedConfig.bridge === Interface.bridge && updatedConfig.tag == Interface.tag) {
          return Promise.resolve(); 
        }
        return fetch(`${API_BASE}/server/${server}/vm/${vmid}/network/${Interface.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bridge: updatedConfig.bridge,
            tag: updatedConfig.tag ? Number.parseInt(updatedConfig.tag) : null,
            mac: updatedConfig.mac
          })
        }).then(res => {
          if (!res.ok) throw new Error(`Échec de la mise à jour pour ${Interface.id}`);
        });
      });

      await Promise.all(updatePromises);
      onSuccess(); // Déclenche un refresh dans le composant parent
      onClose();   // Ferme la modale après succès
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="clone-container" style={{ maxWidth: '650px' }}>
        
        <h3 className="clone-title" id="modal-title">Réseau de la VM {vmid}</h3>
        
        {/* Affiche l'erreur si une requête a échoué */}
        {error && <div className="error-alert" style={{ margin: "0 20px" }}>{error}</div>}
        
        {isLoadingData ? (
          // État de chargement — shows while fetching bridges and interfaces
          <div className="modal-body" style={{ padding: "20px", textAlign: "center" }}>
            <p>Chargement des configurations réseau...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {interfaces.length > 0 ? (
                // Accordéon par interface réseau (one accordion per network interface)
                interfaces.map(Interface => {
                  const isExpanded = expandedInterface === Interface.id;
                  const currentBridge = formData[Interface.id]?.bridge;
                  const currentTag = formData[Interface.id]?.tag;

                  return (
                    <div key={Interface.id} className="nic-accordion">
                      {/* En-tête de l'accordéon — shows current bridge/VLAN, click to expand */}
                      <div className={`nic-summary ${isExpanded ? 'expanded' : ''}`} onClick={() => setExpandedInterface(isExpanded ? null : Interface.id)}> 
                        <div className="nic-summary-info">
                          <span className="nic-badge">{Interface.id.toUpperCase()}</span>
                          <span className="nic-current-target">
                            → {currentBridge || "Aucun"} {currentTag ? `(VLAN ${currentTag})` : ""}
                          </span>
                        </div>
                        <button type="button" className="toggle-edit-btn">
                          {isExpanded ? "Fermer ✕" : "Modifier ✎"}
                        </button>
                      </div>

                      {/* Détails de l'interface — shown when accordion is expanded */}
                      {isExpanded && (
                        <div className="nic-details">
                          {/* Tableau de sélection du bridge (bridge selector table) */}
                          <div className="form-group">
                            <label>Sélectionnez le nouveau pont réseau :</label>
                            <div className="bridge-table-container">
                              <table className="bridge-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: '50px' }}>Choix</th>
                                    <th>Bridge</th>
                                    <th>Statut</th>
                                    <th>Commentaire</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {availableBridges.map((bridge) => (
                                    <tr 
                                      key={bridge.iface} 
                                      className={currentBridge === bridge.iface ? "selected-row" : ""}
                                      onClick={() => handleChange(Interface.id, 'bridge', bridge.iface)}
                                      style={{ cursor: 'pointer' }}
                                    >
                                      <td style={{ textAlign: 'center' }}>
                                        <input 
                                          type="radio" 
                                          name={`bridge-group-${Interface.id}`}
                                          value={bridge.iface}
                                          checked={currentBridge === bridge.iface}
                                          onChange={() => handleChange(Interface.id, 'bridge', bridge.iface)}
                                        />
                                      </td>
                                      <td><strong>{bridge.iface}</strong></td>
                                      <td>
                                        {/* Badge de statut actif/inactif */}
                                        <span className={`status-badge ${bridge.active ? 'active' : 'inactive'}`}>
                                          {bridge.active ? "Actif" : "Inactif"}
                                        </span>
                                      </td>
                                      <td className="bridge-comment">{bridge.comments || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Champs VLAN tag et adresse MAC */}
                          <div className="form-group-tag-mac" style={{ marginTop: '15px' }}>
                            <div className="input-pair">
                              <label htmlFor={`tag-input-${Interface.id}`}>Tag VLAN (Optionnel) :</label>
                              <input 
                                id={`tag-input-${Interface.id}`}
                                className="create-input"
                                type="number" 
                                placeholder="Ex: 10"
                                value={currentTag || ""}
                                onChange={(e) => handleChange(Interface.id, 'tag', e.target.value)}
                                style={{ width: '100%', maxWidth: '200px' }}
                              />
                            </div>

                            <div className="input-pair">      
                              <label htmlFor={`mac-input-${Interface.id}`}>Adresse MAC :</label>
                              <input 
                                id={`mac-input-${Interface.id}`}
                                className="create-input"
                                type="text" 
                                placeholder="Ex: AA:BB:CC:DD:EE:FF"
                                value={formData[Interface.id]?.mac || ""}
                                onChange={(e) => handleChange(Interface.id, 'mac', e.target.value)}
                                style={{ width: '100%', maxWidth: '200px' }}
                              />
                            </div>
                          </div>

                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  Aucune interface réseau trouvée pour cette VM.
                </p>
              )}
            </div>

            {/* Boutons Annuler / Enregistrer (footer buttons) */}
            <div className="modal-footer">
              <button type="button" onClick={onClose} disabled={isSubmitting} className="cancel-btn">
                Annuler
              </button>
              <button type="submit" disabled={isSubmitting || interfaces.length === 0} className="confirm-btn create-btn">
                {isSubmitting ? "Sauvegarde..." : "Enregistrer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

EditNetworkModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  server: PropTypes.string,
  vmid: PropTypes.number,
  currentInterfaces: PropTypes.array,
  onSuccess: PropTypes.func
};
