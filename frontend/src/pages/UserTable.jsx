import { useState, useMemo } from "react";
import { useCsvData } from "../hooks/useCsvData";
import "../styles/userTable.css";

export default function UsersTable({ user }) {
  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  const { filenames, selectedFile, fileData, headers, loading, loadFile, deleteFile, uploadFile } = useCsvData(API_BASE);

  const isAdmin = user?.role === "admin";

  const [globalSearch, setGlobalSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const [showColumnFilters, setShowColumnFilters] = useState(false);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const activeFilterCount = useMemo(() =>
    (globalSearch ? 1 : 0) + Object.values(columnFilters).filter(v => v?.trim()).length,
    [globalSearch, columnFilters]
  );

  const filteredData = useMemo(() => {
    if (!fileData.length) return [];
    return fileData.filter(row => {
      if (globalSearch.trim()) {
        const term = globalSearch.toLowerCase();
        if (!headers.some(h => String(row[h] ?? "").toLowerCase().includes(term))) return false;
      }
      for (const [header, value] of Object.entries(columnFilters)) {
        if (!value?.trim()) continue;
        if (!String(row[header] ?? "").toLowerCase().includes(value.toLowerCase())) return false;
      }
      return true;
    });
  }, [fileData, headers, globalSearch, columnFilters]);

  return (
    <div className="userTable">
      <div className="layout">

        {/* Sidebar */}
        <aside className="files-sidebar">
          <h2>CSV Files</h2>

          {!user && (
            <div className="login-hint">
              <span>🔒</span>
              <p>Connectez-vous pour importer ou supprimer des fichiers</p>
            </div>
          )}

          {isAdmin && (
            <label className="upload-btn">
              + Import CSV
              <input type="file" accept=".csv" style={{ display: "none" }} onChange={handleUpload} />
            </label>
          )}

          {filenames.length === 0 ? (
            <p>No files available</p>
          ) : (
            <ul>
              {filenames.map((filename, i) => (
                <li key={i} className={`file-item ${selectedFile === filename ? "active" : ""}`}>
                  <span className="file-name" onClick={() => loadFile(filename)}>{filename}</span>
                  {isAdmin && (
                    <button className="delete-btn" onClick={() => deleteFile(filename)} title={`Delete ${filename}`}>✕</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main content */}
        <main className="file-content">
          {!selectedFile ? (
            <div className="empty-state">Sélectionnez un fichier CSV pour voir son contenu</div>
          ) : loading ? (
            <div className="loading">Chargement de {selectedFile}...</div>
          ) : (
            <>
              <div className="content-header">
                <div className="content-title">
                  <h2>{selectedFile}</h2>
                  <span className="row-count">{filteredData.length} / {fileData.length} lignes</span>
                </div>

                <div className="toolbar">
                  <div className="search-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Rechercher dans toutes les colonnes..."
                      value={globalSearch}
                      onChange={e => setGlobalSearch(e.target.value)}
                    />
                    {globalSearch && <button className="clear-input" onClick={() => setGlobalSearch("")}>✕</button>}
                  </div>

                  <button
                    className={`filter-toggle-btn ${showColumnFilters ? "active" : ""}`}
                    onClick={() => setShowColumnFilters(v => !v)}
                  >
                    ⚙ Filtres
                    {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
                  </button>

                  {activeFilterCount > 0 && (
                    <button className="clear-filters-btn" onClick={() => { setGlobalSearch(""); setColumnFilters({}); }}>
                      Effacer tout
                    </button>
                  )}
                </div>

                {showColumnFilters && (
                  <div className="column-filters">
                    {headers.map((header, i) => (
                      <div key={i} className="column-filter-item">
                        <label className="column-filter-label">{header || "—"}</label>
                        <input
                          type="text"
                          className="column-filter-input"
                          placeholder="Filtrer..."
                          value={columnFilters[header] || ""}
                          onChange={e => setColumnFilters(prev => ({ ...prev, [header]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>{headers.map((h, i) => <th key={i}>{h || "—"}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filteredData.length === 0 ? (
                      <tr><td colSpan={headers.length} style={{ textAlign: "center", color: "#aaa", padding: "32px" }}>Aucun résultat</td></tr>
                    ) : (
                      filteredData.map((row, i) => (
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