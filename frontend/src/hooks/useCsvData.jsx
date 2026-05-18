// useCsvData.jsx
// Hook React personnalisé (custom hook) qui centralise toute la logique CSV :
// - Récupération de la liste des fichiers CSV étudiants and VM export files
// - Chargement des headers et lignes d'un fichier spécifique
// - Suppression et upload de fichiers CSV
// - Lancement d'un job de clonage en lot from a CSV and polling its progress

import {useCallback, useEffect, useState, useRef } from "react";

export function useCsvData(apiBase = "/app2/api") {
  const [filenames, setFilenames] = useState([]);         // Liste des CSVs étudiants
  const [VMfilenames, setVMFilenames] = useState([]);     // Liste des CSVs exports VM
  const [selectedFile, setSelectedFile] = useState(null); // Fichier actuellement chargé
  const [fileData, setFileData] = useState([]);           // Lignes du CSV chargé
  const [headers, setHeaders] = useState([]);             // Colonnes du CSV chargé
  const [loading, setLoading] = useState(false);          // Loading state for file content
  const [progress, setProgress] = useState({ current: 0, total: 0 }); // Progression du job de clonage
  const [cloneStatus, setCloneStatus] = useState("idle"); // idle | running | success | error

  // Ref pour stocker l'ID de l'interval de polling — cleared on unmount
  const pollingIntervalRef = useRef(null);

  // Nettoyage : on efface l'interval quand le composant est démonté
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Récupère la liste des CSVs étudiants depuis le backend
  const fetchFilenames = useCallback(() => {
    fetch(`${apiBase}/csv/filenames`, { credentials: "include" })
      .then(res => res.json())
      .then(data => setFilenames(data.filenames || []))
      .catch(err => console.error(err));
  }, [apiBase]);

  // Récupère la liste des CSVs d'export VM depuis le backend
  const fetchVMFilenames = useCallback(() => {
    fetch(`${apiBase}/csv/VMsFilenames`, { credentials: "include" })
      .then(res => res.json())
      .then(data => setVMFilenames(data.filenames || []))
      .catch(err => console.error(err));
  }, [apiBase]);

  // Fetch both file lists on initial mount
  useEffect(() => {
    fetchFilenames();
    fetchVMFilenames();
  }, [fetchFilenames, fetchVMFilenames]);

  // Charge les headers et les lignes d'un fichier CSV spécifique
  const loadFile = (filename) => {
    setLoading(true);
    setSelectedFile(filename);
    const encodedPath = encodeURIComponent(filename);

    // Fetch headers and rows in parallel pour optimiser les appels réseau
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

  // Supprime un fichier CSV après confirmation de l'utilisateur
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
        // Si le fichier supprimé était chargé, on reset la vue
        if (selectedFile === filename) {
          setSelectedFile(null);
          setFileData([]);
          setHeaders([]);
        }
        // Refresh both file lists
        fetchFilenames();
        fetchVMFilenames();
      })
      .catch(err => alert(`Erreur lors de la suppression: ${err.message}`));
  };

  // Upload un nouveau fichier CSV vers le backend
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
      fetchFilenames(); // Refresh file list after upload
    } catch {
      alert("Erreur upload");
    }
  };

  // Lance un job de clonage en lot depuis un fichier CSV :
  // 1. Upload du CSV vers le backend
  // 2. Déclenchement du job — on récupère un job_id
  // 3. Polling du statut toutes les 2 secondes until completion or error
  const startCloneJob = async (file) => {
    setCloneStatus("running");
    setProgress({ current: 0, total: 0 });

    // On efface tout interval de polling existant
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const formData = new FormData();
    formData.append("csv", file);

    try {
      // Étape 1 : Upload du fichier CSV — backend returns the saved filename
      const resUp = await fetch(`${apiBase}/csv/upload-vm`, {
        method: "POST",
        credentials: "include",
        body: formData
      });
    
      if (!resUp.ok) throw new Error("Échec de l'upload du fichier.");
      
      const { filename } = await resUp.json();

      // Étape 2 : Lancement du job de clonage — on passe uniquement le nom du fichier
      const res = await fetch(`${apiBase}/vm/clone-csv?csv_name=${encodeURIComponent(filename)}`, {
        method: "POST",
        credentials: "include"
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Erreur lancement");
      }

      const { job_id } = await res.json();
      
      // Étape 3 : Polling every 2 seconds
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${apiBase}/vm/clone-csv/status/${job_id}`, { credentials: "include" });

          if (!statusRes.ok) {
            clearInterval(pollingIntervalRef.current);
            setCloneStatus("error");
            return;
          }

          const data = await statusRes.json();

          // Mise à jour de la barre de progression
          if (data.total !== undefined) {
            setProgress({ current: data.current || 0, total: data.total || 0 });
          }

          if (data.status === "completed") {
            // Fill progress bar to 100% on completion
            setProgress(prev => ({ ...prev, current: prev.total })); 
            setCloneStatus("success");
            clearInterval(pollingIntervalRef.current);
            fetchVMFilenames(); // Refresh de la liste après clonage
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

  // Expose tous les états et actions aux composants consommateurs
  return { 
    filenames, VMfilenames, selectedFile, fileData, headers, loading, 
    loadFile, deleteFile, uploadFile, fetchFilenames, fetchVMFilenames,
    startCloneJob, cloneStatus, setCloneStatus, progress
  };
}
