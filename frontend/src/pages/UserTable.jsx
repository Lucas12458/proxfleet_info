import { useState } from "react";
import { useCsvData } from "../hooks/useCsvData";
import "../styles/userTable.css";

export default function UsersTable({ user }) {
  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  const {
    filenames,
    selectedFile,
    fileData,
    headers,
    loading,
    loadFile,
    deleteFile,
    uploadFile
  } = useCsvData(API_BASE);

  // Determine if the current user has administrative rights
  const isAdmin = user?.role === "admin";

  /**
   * Handles the file upload event.
   * Only accessible to users with admin/professor roles.
   * * @param {Event} e - The file input change event.
   */
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
    
    // Reset the input value to allow uploading the same file again if needed
    e.target.value = "";
  };

  return (
    <div className="userTable">
      <div className="layout">
        
        {/* Sidebar for file navigation */}
        <aside className="files-sidebar">
          <h2>CSV Files</h2>

          {/* Conditional Rendering: Only admins can see and use the upload button */}
          {isAdmin && (
            <label className="upload-btn">
              + Import CSV
              <input 
                type="file" 
                accept=".csv"
                style={{ display: "none" }} 
                onChange={handleUpload} 
              />
            </label>
          )}

          {filenames.length === 0 ? (
            <p>No files available</p>
          ) : (
            <ul>
              {filenames.map((filename, i) => (
                <li key={i} className={`file-item ${selectedFile === filename ? "active" : ""}`}>
                  
                  <span className="file-name" onClick={() => loadFile(filename)}>
                    {filename}
                  </span>
                  
                  {/* Conditional Rendering: Only admins can see the delete button */}
                  {isAdmin && (
                    <button
                      className="delete-btn"
                      onClick={() => deleteFile(filename)}
                      title={`Delete ${filename}`}
                    >
                      X
                    </button>
                  )}
                  
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main content area for displaying the CSV table data */}
        <main className="file-content">
          {!selectedFile ? (
            <div className="empty-state">Select a CSV file to view its content</div>
          ) : loading ? (
            <div className="loading">Loading {selectedFile}...</div>
          ) : (
            <>
              <h2>{selectedFile}</h2>
              <p>Total rows: {fileData.length}</p>
              
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {headers.map((header, i) => (
                        <th key={i}>{header || "-"}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fileData.length === 0 ? (
                      <tr>
                        <td colSpan={headers.length}>No data found</td>
                      </tr>
                    ) : (
                      fileData.map((row, i) => (
                        <tr key={i}>
                          {headers.map((header, j) => (
                            <td key={j} className={j === 1 ? "name" : ""}>
                              {row[header] || "-"}
                            </td>
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