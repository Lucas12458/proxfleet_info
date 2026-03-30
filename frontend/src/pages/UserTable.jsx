import { Link } from "react-router-dom";
import "../styles/userTable.css";
import { useCsvData } from "../hooks/useCsvData";
import { useState, useEffect } from "react";


export default function UsersTable() {
  const [users, setUsers] = useState([]);
  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;
    

  useEffect(() => {
    fetch(`${API_BASE}/csv/assignments?csv_id=students_example.csv`, {
      credentials: "include" // important si cookie de session
    })
      .then(res => res.json())
      .then(data => setUsers(data.data))
      .catch(err => console.error(err));
  }, []);
  const { filenames, selectedFile, fileData, headers, loading, loadFile, deleteFile, uploadFile } = useCsvData();

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  return (
    <div className="userTable">
      <div className="top-bar">
        <Link to="/auth" className="auth-link-btn">Page auth</Link>
      </div>

      <div className="layout">
        <aside className="files-sidebar">
          <h2>Fichiers CSV</h2>

          <label className="upload-btn">
            + Importer CSV
            <input type="file" accept=".csv" style={{ display: "none" }} onChange={handleUpload} />
          </label>

          {filenames.length === 0 ? (
            <p>Aucun fichier</p>
          ) : (
            <ul>
              {filenames.map((filename, i) => (
                <li key={i} className={`file-item ${selectedFile === filename ? "active" : ""}`}>
                  <span className="file-name" onClick={() => loadFile(filename)}>
                    {filename}
                  </span>
                  <button
                    className="delete-btn"
                    onClick={() => deleteFile(filename)}
                    title={`Supprimer ${filename}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="file-content">
          {!selectedFile ? (
            <div className="empty-state">Sélectionne un fichier CSV</div>
          ) : loading ? (
            <div className="loading">Chargement de {selectedFile}...</div>
          ) : (
            <>
              <h2>{selectedFile}</h2>
              <p>Taille : {fileData.length}</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {headers.map((header, i) => <th key={i}>{header || "—"}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {fileData.length === 0 ? (
                      <tr><td colSpan={headers.length}>Aucune donnée</td></tr>
                    ) : (
                      fileData.map((row, i) => (
                        <tr key={i}>
                          {headers.map((header, j) => (
                            <td key={j} className={j === 1 ? "name" : ""}>{row[header] || "—"}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}