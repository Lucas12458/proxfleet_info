import { useState, useMemo } from "react";
import { useCsvData } from "../hooks/useCsvData";
import {CloneModal} from "./BulkCloneVm";
import { PermissionsModal } from "./PermissionsModal";
import PropTypes from 'prop-types';

import "../styles/userTable.css";

export default function UsersTable({ user }) {
  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;
  

  const { filenames,VMfilenames, selectedFile, fileData, headers, loading, loadFile, deleteFile, uploadFile, startCloneJob, cloneStatus, setCloneStatus, progress } = useCsvData(API_BASE);

  const isAdmin = user?.role === "admin";

  const [globalSearch, setGlobalSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);


  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDownload = async (filename) => {
    try {
      const response = await fetch(`${API_BASE}/csv/download/${filename}`, {
        method: "GET",
        credentials: "include" // Required to pass the authentication middleware
      });

      // Handle session expiration
      if (response.status === 401) {
        sessionStorage.removeItem("user_session");
        globalThis.location.href = "/auth";
        return;
      }

      if (!response.ok) {
        throw new Error("Download failed due to a server error.");
     }

      // Convert the response to a Blob
      const blob = await response.blob();
    
      // Generate a temporary URL for the Blob
      const downloadUrl = globalThis.URL.createObjectURL(blob);
    
      // Create a hidden anchor element to trigger the download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename; 
    
      document.body.appendChild(link);
      link.click();
    
      // Clean up the DOM and release memory
      link.remove();
      globalThis.URL.revokeObjectURL(downloadUrl);

    } catch (error) {
      console.error("Error while downloading the CSV file:", error);
    }
  };

 const handleVMDownload = async (filename) => {
    try {
      const response = await fetch(`${API_BASE}/csv/download-export/${filename}`, {
        method: "GET",
        credentials: "include" // Required to pass the authentication middleware
      });

      // Handle session expiration
      if (response.status === 401) {
        sessionStorage.removeItem("user_session");
        globalThis.location.href = "/auth";
        return;
      }

      if (!response.ok) {
        throw new Error("Download failed due to a server error.");
     }

      // Convert the response to a Blob
      const blob = await response.blob();
    
      // Generate a temporary URL for the Blob
      const downloadUrl = globalThis.URL.createObjectURL(blob);
    
      // Create a hidden anchor element to trigger the download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename; 
    
      document.body.appendChild(link);
      link.click();
    
      // Clean up the DOM and release memory
      link.remove();
      globalThis.URL.revokeObjectURL(downloadUrl);

    } catch (error) {
      console.error("Error while downloading the CSV file:", error);
    }
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

        <div className="aside-div">
        {/* Sidebar */}
        <aside className="files-sidebar">
          <h2>CSV Files</h2>

         
          {(isAdmin || user?.permissions?.can_modify_csv) && (
            
            <label className="upload-btn">{filenames.length > 0 ? "+ Remplacer le CSV" : "+ Import CSV" } <input type="file" accept=".csv" style={{ display: "none" }} onChange={handleUpload}/>
            </label>
          )}

         {filenames.length === 0 ? (
            <p>No files available</p>
          ) : (
            <ul>
              {filenames.map((filename, i) => (
                <li key={i} className={`file-item ${selectedFile === filename ? "active" : ""}`}>
                  <button 
                    type="button"
                    className="file-name btn-as-text" 
                    onClick={() => loadFile(filename)}
                    title={`Charger ${filename}`}
                  >
                  {filename}
                  </button>
                  {isAdmin && (
                    <>
                    <button className="delete-btn" onClick={() => deleteFile(filename)} title={`Delete ${filename}`}>✕</button>
                    <button className="action-btn download-btn" onClick={() => handleDownload(filename)} title="Download">
                      <svg 
                        viewBox="0 0 24 24" 
                        width="16" 
                        height="16" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="1.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        style={{ display: 'block' }}
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    </>
                    
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
        
       {(isAdmin || user?.permissions?.can_bulk_clone)&& (
        <aside className="files-sidebar">
          <h2>VMs Files</h2>

          {/* Le bouton pour ouvrir la modale */}
          <button className="upload-btn" onClick={() => setIsCloneModalOpen(true)}>
          Cloner VMs
          </button>

          {/* La liste des fichiers VMs */}
          {VMfilenames.length === 0 ? (
          <p>No files available</p>
          ) : (
            <ul>
            {VMfilenames.map((filename, i) => (
              <li key={i} className={`file-item ${selectedFile === filename ? "active" : ""}`}>
                <button 
                    type="button"
                    className="file-name btn-as-text" 
                    onClick={() => loadFile(filename)}

                  >{filename}

                </button>
               
                <button className="delete-btn" onClick={() => deleteFile(filename)} title={`Delete ${filename}`}>
                    ✕
                </button>
                <button className="action-btn download-btn" onClick={() => handleVMDownload(filename)} title="Download">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                </button>
              </li>
            ))}
            </ul>
          )}
        </aside>
        )}

        {isAdmin && (
        <aside className="files-sidebar">
          <h2>Privilèges</h2>

          {/* Le bouton pour ouvrir la modale */}
          <button className="upload-btn" onClick={() => setIsPermissionsModalOpen(true)}>
          Gérer les privilèges
          </button>
        </aside>
        )}



    </div>

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
          <CloneModal 
            isOpen={isCloneModalOpen}
            onClose={() => { 
              setIsCloneModalOpen(false); 
              setTimeout(() => setCloneStatus("idle"), 300); // Reset après la fermeture
            }}
            onStartClone={startCloneJob}
            status={cloneStatus}
            progress={progress}
          />
          <PermissionsModal 
            isOpen={isPermissionsModalOpen}
            onClose={() => { 
              setIsPermissionsModalOpen(false); 
              
            }}
            server={localStorage.getItem("server") || "all"}
            currentUser={user}
           
          />
        </main>
      </div>
    </div>
    
  );
}

UsersTable.propTypes = {
  user: PropTypes.object
}