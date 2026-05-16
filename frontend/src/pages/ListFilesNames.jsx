// ListFilesNames.jsx
// Composant simple qui récupère et affiche la liste des fichiers CSV disponibles.
// Each file has a "Sélectionner" button for future interaction (ex: charger son contenu).

import { useEffect, useState } from "react";
import "../styles/userTable.css";

export default function UsersTable() {
  const [files, setFiles] = useState([]); // Liste des noms de fichiers CSV
  const API_BASE = `${import.meta.env.BASE_URL}api`;

  // Gère le clic sur un fichier — placeholder for future logic like loading file content
  const handleClick = (e, filename) => {
    e.preventDefault();
    console.log("Fichier cliqué :", filename);
  };

  // Récupère la liste des fichiers CSV au montage du composant
  useEffect(() => {
    fetch(`${API_BASE}/csv/filenames`, { credentials: "include" })
      .then(res => {
        if (!res.ok) throw new Error("Erreur réseau");
        return res.json();
      })
      .then(data => {
        setFiles(data.filenames || []);
      })
      .catch(err => console.error("Erreur lors du fetch :", err));
  }, [API_BASE]);

  return (
    <div className="filesNames">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom du fichier</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {files.map((filename, i) => (
              <tr key={i}>
                <td>{filename}</td> 
                <td>
                  <button 
                    type="button" 
                    className="btn-as-link" 
                    onClick={(e) => handleClick(e, filename)}>
                    Sélectionner
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 && <p>Aucun fichier trouvé.</p>}
      </div>
    </div>
  );
}
