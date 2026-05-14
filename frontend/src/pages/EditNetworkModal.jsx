import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import "../styles/editNetwork.css"



const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

export function EditNetworkModal({ isOpen, onClose, server, vmid, currentInterfaces: initialInterfaces, onSuccess }) 
{
  const [interfaces, setInterfaces] = useState([]); 
  const [availableBridges, setAvailableBridges] = useState([]);
  const [formData, setFormData] = useState({});
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [expandedInterface, setExpandedInterface] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setExpandedInterface(null);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const bridgeRes = await fetch(`${API_BASE}/server/${server}/interfaces?vlan=all`, {
          signal: controller.signal
        });
        const bridgesData = await bridgeRes.json();
        const formattedBridges = bridgesData.map(b => ({
          iface: b.iface || b.name || b,
          active: b.active === 1 || b.active === true || b.active === '1',
          comments: b.comments || b.comment || ""
        }));
        setAvailableBridges(formattedBridges);

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

        const initialForm = {};
        vmInterfaces.forEach(Interface => {
          initialForm[Interface.id] = { bridge: Interface.bridge || "", tag: Interface.tag || "", mac: Interface.mac || "" };
        });
        setFormData(initialForm);
        
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
    return () => controller.abort();
  }, [isOpen, server, vmid, initialInterfaces]);

  const handleChange = (netId, field, value) => {
    setFormData(prev => ({
      ...prev,
      [netId]: { ...prev[netId], [field]: value }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const updatePromises = interfaces.map(Interface => {
        const updatedConfig = formData[Interface.id];
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
      onSuccess(); 
      onClose();   
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      {/* 1. Changement de la classe du conteneur */}
      <div className="clone-container" style={{ maxWidth: '650px' }}>
        
        {/* 2. Changement du titre */}
        <h3 className="clone-title" id="modal-title">Réseau de la VM {vmid}</h3>
        
        {error && <div className="error-alert" style={{ margin: "0 20px" }}>{error}</div>}
        
        {isLoadingData ? (
          <div className="modal-body" style={{ padding: "20px", textAlign: "center" }}>
            <p>Chargement des configurations réseau...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            
            {/* 3. Utilisation de modal-body avec les mêmes espacements */}
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {interfaces.length > 0 ? (
                interfaces.map(Interface => {
                  const isExpanded = expandedInterface === Interface.id;
                  const currentBridge = formData[Interface.id]?.bridge;
                  const currentTag = formData[Interface.id]?.tag;

                  return (
                    <div key={Interface.id} className="nic-accordion">
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

                      {isExpanded && (
                        <div className="nic-details">
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

                          <div className="form-group-tag-mac" style={{ marginTop: '15px' }}>
                            <div className="input-pair">
                              <label htmlFor={`tag-input-${Interface.id}`}>Tag VLAN (Optionnel) :</label>
                              <input 
                                id={`tag-input-${Interface.id}`}
                                className="create-input" /* 4. Ajout de la classe d'input standard */
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

            {/* 5. Utilisation de modal-footer et des classes de boutons standard */}
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

}