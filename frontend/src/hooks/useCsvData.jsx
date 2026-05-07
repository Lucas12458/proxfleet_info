import {useCallback, useEffect, useState, useRef } from "react";

export function useCsvData(apiBase = "/app2/api") {
  const [filenames, setFilenames] = useState([]);
  const [VMfilenames, setVMFilenames] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [cloneStatus, setCloneStatus] = useState("idle"); // idle, running, success, error

  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const fetchFilenames = useCallback(() => {
    fetch(`${apiBase}/csv/filenames`, { credentials: "include" })
      .then(res => res.json())
      .then(data => setFilenames(data.filenames || []))
      .catch(err => console.error(err));
  }, [apiBase]);

   const fetchVMFilenames = useCallback(() => {
    fetch(`${apiBase}/csv/VMsFilenames`, { credentials: "include" })
      .then(res => res.json())
      .then(data => setVMFilenames(data.filenames || []))
      .catch(err => console.error(err));
  }, [apiBase]);


useEffect(() => {
  fetchFilenames();
  fetchVMFilenames();
}, [fetchFilenames, fetchVMFilenames]);

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
        fetchVMFilenames();
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

  const startCloneJob = async (file) => {
    setCloneStatus("running");
    setProgress({ current: 0, total: 0 });

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const formData = new FormData();
    formData.append("csv", file);

    try {
      // 1. Upload du fichier et récupération du nom sauvegardé sur le serveur
      const resUp = await fetch(`${apiBase}/csv/upload-vm`, {
        method: "POST",
        credentials: "include",
        body: formData
      });
    
      if (!resUp.ok) throw new Error("Échec de l'upload du fichier.");
      
      const { filename } = await resUp.json(); // Le backend doit renvoyer le nom du fichier

      // 2. Lancement du clonage en passant uniquement le nom du fichier
      // On passe le nom en paramètre de requête (query param)
      const res = await fetch(`${apiBase}/vm/clone-csv?csv_name=${encodeURIComponent(filename)}`, {
        method: "POST",
        credentials: "include"
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Erreur lancement");
      }

    const { job_id } = await res.json();
      
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${apiBase}/vm/clone-csv/status/${job_id}`, { credentials: "include" });

          if (!statusRes.ok) {
            clearInterval(pollingIntervalRef.current);
            setCloneStatus("error");
            return; // On arrête l'exécution ici
          }

          const data = await statusRes.json();

          if (data.total !== undefined) {
            setProgress({ current: data.current || 0, total: data.total || 0 });
          }

         if (data.status === "completed") {
            setProgress(prev => ({ ...prev, current: prev.total })); 
            
            setCloneStatus("success");
            clearInterval(pollingIntervalRef.current);
            fetchVMFilenames();
          } else if (data.status === "error") {
            setCloneStatus("error");
            clearInterval(pollingIntervalRef.current);
          }
          
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 2000);

    } catch (err) {
      alert(err.message);
      setCloneStatus("error");
    }
  };

  return { 
    filenames,VMfilenames, selectedFile, fileData, headers, loading, 
    loadFile, deleteFile, uploadFile,fetchFilenames,fetchVMFilenames,
    startCloneJob, cloneStatus, setCloneStatus, progress // On exporte tout
  };
}