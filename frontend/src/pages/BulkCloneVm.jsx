// BulkCloneVm.jsx
// Modale pour lancer un job de clonage en lot depuis un fichier CSV.
// Displays a file picker, une barre de progression, and action buttons (Démarrer / Annuler / Réessayer).

import { useState, useEffect} from "react";
import PropTypes from 'prop-types';
import "../styles/cloneVm.css";

// Props:
//   - isOpen : si la modale est visible
//   - onClose : callback pour fermer la modale
//   - onStartClone : callback qui lance le job avec le fichier sélectionné
//   - status : état courant du job — 'idle' | 'running' | 'success' | 'error'
//   - progress : objet { current, total } pour la barre de progression
export function CloneModal({ isOpen, onClose, onStartClone, status, progress }) {
  const [selectedFile, setSelectedFile] = useState(null);

  // Réinitialise le fichier sélectionné whenever the modal is closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
    }
  }, [isOpen]);

  // Ne rend rien si la modale est fermée
  if (!isOpen) return null;

  // Calcule le pourcentage pour la barre de progression
  const percent = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  // Déclenche le job de clonage with the selected file
  const handleStart = () => {
    if (selectedFile) {
      onStartClone(selectedFile);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="clone-container">
        <h2 className="clone-title">Déploiement en lot de VMs</h2>

        {/* Sélecteur de fichier — only shown when idle or after an error */}
        {status === 'idle' || status === 'error' ? (
          <div className="upload-section">
            <label htmlFor="csv-input">Sélectionnez le fichier CSV de configuration</label>
              <input 
                id="csv-input"
                type="file" 
                accept=".csv" 
                className="file-input"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
          </div>
        ) : null}

        {/* Zone de progression — shown once the job has started */}
        {status !== 'idle' && (
          <div className="progress-section">
            <div className="progress-header">
              <span>
                Progression : {progress.current} / {progress.total}
              </span>
              {/* Badge indiquant l'état courant du job */}
              <span className={`status-badge status-${status}`}>
                {status === 'running' && 'En cours...'}
                {status === 'success' && 'Terminé !'}
                {status === 'error' && 'Erreur'}
              </span>
            </div>

            {/* Barre de progression (progress bar) */}
            <div className="progress-track">
              <div 
                className={`progress-fill ${status}`} 
                style={{ width: `${percent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Boutons d'action (action buttons) */}
        <div className="button-group">
          {/* Annuler / Fermer — disabled while the job is running */}
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={status === 'running'}
          >
            {status === 'success' ? 'Fermer' : 'Annuler'}
          </button>
          
          {/* Démarrer / Réessayer — only shown when idle or after an error */}
          {(status === 'idle' || status === 'error') && (
            <button 
              className="btn btn-primary" 
              onClick={handleStart}
              disabled={!selectedFile || status === 'running'}
            >
              {status === 'error' ? 'Réessayer' : 'Démarrer le clonage'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

CloneModal.propTypes = {
    isOpen: PropTypes.bool,
    onClose: PropTypes.func, 
    onStartClone: PropTypes.func, 
    progress: PropTypes.number, 
    status: PropTypes.string 
};
