import { useState, useEffect} from "react";
import "../styles/cloneVm.css";

export function CloneModal({ isOpen, onClose, onStartClone, status, progress }) {
  const [selectedFile, setSelectedFile] = useState(null);

  // Réinitialiser le fichier quand la modale se ferme
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const percent = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  const handleStart = () => {
    if (selectedFile) {
      onStartClone(selectedFile);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="clone-container">
        <h2 className="clone-title">Déploiement en lot de VMs</h2>

        {/* Zone de fichier (cachée si le clonage est en cours ou terminé avec succès) */}
        {status === 'idle' || status === 'error' ? (
          <div className="upload-section">
            <label>Sélectionnez le fichier CSV de configuration</label>
            <input 
              type="file" 
              accept=".csv" 
              className="file-input"
              onChange={(e) => setSelectedFile(e.target.files[0])}
            />
          </div>
        ) : null}

        {/* Zone de progression */}
        {status !== 'idle' && (
          <div className="progress-section">
            <div className="progress-header">
              <span>
                Progression : {progress.current} / {progress.total}
              </span>
              <span className={`status-badge status-${status}`}>
                {status === 'running' && 'En cours...'}
                {status === 'success' && 'Terminé !'}
                {status === 'error' && 'Erreur'}
              </span>
            </div>

            <div className="progress-track">
              <div 
                className={`progress-fill ${status}`} 
                style={{ width: `${percent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Boutons d'action */}
        <div className="button-group">
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={status === 'running'}
          >
            {status === 'success' ? 'Fermer' : 'Annuler'}
          </button>
          
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