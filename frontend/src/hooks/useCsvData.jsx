import {useCallback, useEffect, useState } from "react";

export function useCsvData(apiBase = "/app2/api") {
  const [filenames, setFilenames] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchFilenames = useCallback(() => {
    fetch(`${apiBase}/csv/filenames`, { credentials: "include" })
      .then(res => res.json())
      .then(data => setFilenames(data.filenames || []))
      .catch(err => console.error(err));
  }, [apiBase]);

useEffect(() => {
  fetchFilenames();
}, [fetchFilenames]);

  const loadFile = (filename) => {
    setLoading(true);
    setSelectedFile(filename);
    const encodedPath = encodeURIComponent(filename);

    Promise.all([
      fetch(`${apiBase}/csv/header?csv_path=${encodedPath}`, { credentials: "include" }).then(res => res.json()),
      fetch(`${apiBase}/csv/read?csv_path=${encodedPath}`, { credentials: "include" }).then(res => res.json())
    ])
      .then(([headerData, csvData]) => {
        const h = headerData.header ?? headerData.headers ?? headerData;
        setHeaders(Array.isArray(h) ? h : Object.keys(csvData[0] || {}));
        setFileData(Array.isArray(csvData) ? csvData : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Erreur:", err);
        setLoading(false);
      });
  };

  const deleteFile = (filename) => {
    if (!confirm(`Voulez-vous vraiment supprimer "${filename}" ?`)) return;
    const encodedPath = encodeURIComponent(filename);

    fetch(`${apiBase}/csv/delete?csv_path=${encodedPath}`, {
      method: "DELETE",
      credentials: "include"
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        if (selectedFile === filename) {
          setSelectedFile(null);
          setFileData([]);
          setHeaders([]);
        }
        fetchFilenames();
      })
      .catch(err => alert(`Erreur lors de la suppression: ${err.message}`));
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("csv", file);
    try {
      const res = await fetch(`${apiBase}/csv/upload`, {
        method: "POST",
        credentials: "include",
        body: formData
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Erreur: ${err.detail}`);
        return;
      }
      fetchFilenames();
    } catch {
      alert("Erreur upload");
    }
  };

  return { filenames, selectedFile, fileData, headers, loading, loadFile, deleteFile, uploadFile, fetchFilenames };
}