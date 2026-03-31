import { useEffect, useState } from "react";
import "../styles/userTable.css";

export default function UsersTable() {
  const [files, setFiles] = useState([]); // Nommé plus logiquement 'setFiles'
  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  //const API_BASE = `${BASE}api`;
  const API_BASE = "api";


  // Fonction pour gérer le clic
  const handleClick = (e, filename) => {
    e.preventDefault();
    console.log("Fichier cliqué :", filename);
    // Ajoute ici ta logique (ex: charger le contenu du fichier)
  };

  useEffect(() => {
    // Correction de l'URL : filenames (avec un s)
    fetch(`${API_BASE}/csv/filenames`, { credentials: "include" })
      .then(res => {
        if (!res.ok) throw new Error("Erreur réseau");
        return res.json();
      })
      .then(data => {
        // On s'assure que data.filenames existe bien
        setFiles(data.filenames || []);
      })
      .catch(err => console.error("Erreur lors du fetch :", err));
  }, []);

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
                  <a href="#" onClick={(e) => handleClick(e, filename)}>
                    Sélectionner
                  </a>
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
