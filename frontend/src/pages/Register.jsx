import React, { useRef, useState, useEffect, useCallback } from "react";

const ANGLES = [
  { key: "face",        label: "Face",     icon: "😐" },
  { key: "gauche",      label: "Gauche",   icon: "👈" },
  { key: "droite",      label: "Droite",   icon: "👉" },
  { key: "haut",        label: "Haut",     icon: "☝️" },
  { key: "bas",         label: "Bas",      icon: "👇" },
  { key: "diag_gauche", label: "↖ Diag",  icon: "↖️" },
  { key: "diag_droite", label: "↗ Diag",  icon: "↗️" },
];

const ANNEES = ["2024-2025", "2025-2026", "2026-2027"];
const CLASSES = ["L1 Info", "L2 Info", "L3 Info", "M1 Info", "M2 Info", "L1 Math", "L2 Math"];

export default function RegisterPage() {
  const videoRef = useRef(null);
  const canvasOverlayRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const capturedAnglesRef = useRef({});

  const [camActive, setCamActive] = useState(false);
  const [capturedAngles, setCapturedAngles] = useState({});
  const [currentInstruction, setCurrentInstruction] = useState("Appuyez pour démarrer le scan");
  const [instructionClass, setInstructionClass] = useState("waiting");
  const [progress, setProgress] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: "", type: "success" });

  const [form, setForm] = useState({
    nom: "", prenom: "", email_academique: "",
    classe: "", annee_scolaire: ""
  });

  const showToast = (msg, type = "success") => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  const drawScanRing = useCallback((prog) => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cx = size / 2, cy = size / 2;
    const radius = size / 2 - 8;

    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(0,255,128,0.15)";
    ctx.lineWidth = 6;
    ctx.stroke();

    if (prog > 0) {
      const angle = (prog / 100) * 2 * Math.PI - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, -Math.PI / 2, angle);
      ctx.strokeStyle = "#00ff80";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }, []);

  const getNextAngle = (captured) => {
    for (const a of ANGLES) {
      if (!captured[a.key]) return a.key;
    }
    return null;
  };

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = hiddenCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    });
  }, []);

  const getInstructionForAngle = (angle) => {
    const map = {
      "face":        "Regardez droit devant",
      "gauche":      "Tournez à gauche",
      "droite":      "Tournez à droite",
      "haut":        "Regardez en haut",
      "bas":         "Regardez en bas",
      "diag_gauche": "Tournez en haut à gauche",
      "diag_droite": "Tournez en haut à droite"
    };
    return map[angle] || "";
  };

  const startScanLoop = useCallback(() => {
    let lastSentTime = 0;
    const SCAN_INTERVAL = 600; // ✅ réduit de 1500ms à 600ms

    const loop = async () => {
      if (!streamRef.current) return;

      const now = Date.now();
      if (now - lastSentTime < SCAN_INTERVAL) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      lastSentTime = now;

      const blob = await captureFrame();
      if (!blob) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      try {
        const formData = new FormData();
        formData.append("image", blob, "frame.jpg");

        const res = await fetch("http://localhost:8000/api/students/scan-angle", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          const detectedAngle = data.angle;
          const current = capturedAnglesRef.current;

          if (detectedAngle && !current[detectedAngle]) {
            const updated = { ...current, [detectedAngle]: blob };
            capturedAnglesRef.current = updated;
            setCapturedAngles({ ...updated });

            const newProgress = (Object.keys(updated).length / ANGLES.length) * 100;
            setProgress(newProgress);
            drawScanRing(newProgress);

            setCurrentInstruction(`✓ ${ANGLES.find(a => a.key === detectedAngle)?.label} capturé !`);
            setInstructionClass("success");

            if (Object.keys(updated).length >= ANGLES.length) {
              setScanComplete(true);
              setCurrentInstruction("✅ Scan complet ! Cliquez sur Créer mon compte.");
              setInstructionClass("success");
              if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
              }
              setCamActive(false);
              return;
            }

            setTimeout(() => {
              const next = getNextAngle(updated);
              if (next) {
                setCurrentInstruction(getInstructionForAngle(next));
                setInstructionClass("");
              }
            }, 800);
          }
        }
      } catch (e) {
        console.error(e);
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, [captureFrame, drawScanRing]);

  // ✅ FIX PRINCIPAL : on démarre la caméra, puis useEffect attend que
  // React ait monté la <video> avant d'assigner le stream
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = s;

      capturedAnglesRef.current = {};
      setCapturedAngles({});
      setProgress(0);
      setScanComplete(false);
      setCamActive(true); // déclenche le re-render qui monte la <video>
      setCurrentInstruction("😐 Regardez droit devant pour commencer");
      setInstructionClass("");
    } catch {
      setCurrentInstruction("Accès caméra refusé !");
      setInstructionClass("waiting");
    }
  };

  // ✅ Assigne le stream APRÈS que la <video> soit montée dans le DOM
  useEffect(() => {
    if (camActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
      drawScanRing(0);
      startScanLoop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camActive]);

  const restartScan = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    capturedAnglesRef.current = {};
    setCamActive(false);
    setCapturedAngles({});
    setProgress(0);
    setScanComplete(false);
    setCurrentInstruction("Appuyez pour démarrer le scan");
    setInstructionClass("waiting");
    drawScanRing(0);
  };

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    const { nom, prenom, email_academique, classe, annee_scolaire } = form;

    if (!nom || !prenom || !email_academique || !classe || !annee_scolaire) {
      showToast("Veuillez remplir tous les champs.", "error");
      return;
    }
    if (!scanComplete) {
      showToast("Veuillez compléter le scan du visage.", "error");
      return;
    }

    setLoading(true);
    const captured = capturedAnglesRef.current;

    const fd = new FormData();
    fd.append("nom", nom);
    fd.append("prenom", prenom);
    fd.append("email_academique", email_academique);
    fd.append("classe", classe);
    fd.append("annee_scolaire", annee_scolaire);
    ANGLES.forEach(a => fd.append(`image_${a.key}`, captured[a.key], `${a.key}.jpg`));

    try {
      const res = await fetch("http://localhost:8000/api/students/inscrire-complet", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (res.ok) {
        showToast(`✓ ${data.message}`, "success");
        setForm({ nom: "", prenom: "", email_academique: "", classe: "", annee_scolaire: "" });
        restartScan();
      } else {
        showToast(data.detail || "Erreur lors de l'inscription.", "error");
      }
    } catch {
      showToast("Impossible de contacter le serveur.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const canvas = canvasOverlayRef.current;
    if (canvas) { canvas.width = 256; canvas.height = 256; }
    drawScanRing(0);
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [drawScanRing]);

  const completedCount = Object.keys(capturedAngles).length;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0d1b2a;
          color: #e0e0e0;
          font-family: 'Segoe UI', sans-serif;
        }

        .page-bg {
          min-height: 100vh;
          background: #0d1b2a;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 32px 16px 48px;
        }

        .portal-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(0,255,128,0.08);
          border: 1px solid rgba(0,255,128,0.3);
          border-radius: 999px;
          padding: 5px 18px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2px;
          color: #00ff80;
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        .portal-badge::before {
          content: '';
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #00ff80;
          box-shadow: 0 0 6px #00ff80;
        }

        .page-title {
          font-size: 32px;
          font-weight: 800;
          color: #ffffff;
          text-align: center;
          line-height: 1.2;
          margin-bottom: 6px;
        }
        .page-title span { color: #00ff80; }

        .page-subtitle {
          font-size: 14px;
          color: #6b7a8d;
          text-align: center;
          margin-bottom: 28px;
        }

        .card {
          width: 100%;
          max-width: 480px;
          background: #111e2e;
          border: 1px solid rgba(0,255,128,0.12);
          border-radius: 18px;
          padding: 28px 24px;
        }

        .section-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2.5px;
          color: #00ff80;
          text-transform: uppercase;
          margin-bottom: 16px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }
        .form-group label {
          font-size: 12px;
          color: #8899aa;
          font-weight: 500;
        }
        .form-input, .form-select {
          background: #0d1b2a;
          border: 1px solid rgba(0,255,128,0.15);
          border-radius: 8px;
          padding: 10px 14px;
          color: #c0d0e0;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
        }
        .form-input::placeholder { color: #3a4a5a; }
        .form-input:focus, .form-select:focus {
          border-color: rgba(0,255,128,0.5);
        }
        .select-wrapper { position: relative; }
        .select-wrapper::after {
          content: '▾';
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #00ff80;
          pointer-events: none;
          font-size: 13px;
        }
        .form-select option { background: #111e2e; }

        .divider {
          border: none;
          border-top: 1px solid rgba(0,255,128,0.08);
          margin: 20px 0;
        }

        .face-scan-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }

        /* ✅ Camera container: position relative, tout en absolute dedans */
        .cam-container {
          position: relative;
          width: 256px;
          height: 256px;
          border-radius: 14px;
          overflow: hidden;
          background: #0a1520;
          border: 1px solid rgba(0,255,128,0.12);
        }

        /* ✅ Vidéo: absolute, z-index 1, visible */
        .cam-video {
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
          z-index: 1;
          display: block;
          background: transparent;
        }

        /* ✅ Canvas: au-dessus de la vidéo, transparent */
        .cam-overlay-canvas {
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          z-index: 2;
          pointer-events: none;
          background: transparent;
        }

        /* ✅ Écran inactif: en dessous du canvas */
        .cam-inactive {
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #0a1e12;
          z-index: 1;
        }
        .cam-inactive-icon { font-size: 42px; opacity: 0.6; }
        .cam-inactive-text {
          font-size: 11px;
          letter-spacing: 2px;
          color: rgba(0,255,128,0.5);
          text-transform: uppercase;
        }

        .angle-dots {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .angle-dot {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          font-size: 10px;
          color: #3a5a4a;
          transition: color 0.3s;
        }
        .angle-dot.done { color: #00ff80; }
        .dot-circle {
          width: 28px; height: 28px;
          border-radius: 50%;
          border: 1.5px solid #1a3a2a;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px;
          background: #0a1a12;
          transition: all 0.3s;
        }
        .angle-dot.done .dot-circle {
          border-color: #00ff80;
          background: rgba(0,255,128,0.1);
          box-shadow: 0 0 8px rgba(0,255,128,0.3);
        }

        .instruction-text {
          font-size: 13px;
          color: #8899aa;
          text-align: center;
          min-height: 20px;
          transition: color 0.3s;
        }
        .instruction-text.success { color: #00ff80; }
        .instruction-text.waiting { color: #4a6a5a; }

        .progress-bar-bg {
          width: 100%;
          height: 4px;
          background: #1a2a1a;
          border-radius: 99px;
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          background: #00ff80;
          border-radius: 99px;
          transition: width 0.4s ease;
          box-shadow: 0 0 8px rgba(0,255,128,0.5);
        }
        .progress-label {
          font-size: 11px;
          color: #4a7a5a;
          text-align: center;
        }

        .btn-scan {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1.5px solid #00ff80;
          border-radius: 999px;
          padding: 9px 24px;
          color: #00ff80;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 1px;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .btn-scan:hover {
          background: rgba(0,255,128,0.08);
          box-shadow: 0 0 14px rgba(0,255,128,0.2);
        }

        .btn-restart {
          background: transparent;
          border: 1px solid #1a3a2a;
          border-radius: 8px;
          padding: 6px 14px;
          color: #4a7a5a;
          font-size: 12px;
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .btn-restart:hover {
          border-color: #00ff80;
          color: #00ff80;
        }

        .btn-submit {
          width: 100%;
          padding: 15px;
          background: #00ff80;
          border: none;
          border-radius: 10px;
          color: #0a1a10;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          margin-top: 22px;
          letter-spacing: 0.5px;
          transition: opacity 0.2s, box-shadow 0.2s;
          box-shadow: 0 0 20px rgba(0,255,128,0.25);
        }
        .btn-submit:hover:not(:disabled) {
          opacity: 0.9;
          box-shadow: 0 0 30px rgba(0,255,128,0.4);
        }
        .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        .toast {
          position: fixed;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%) translateY(80px);
          background: #111e2e;
          border: 1px solid rgba(0,255,128,0.3);
          border-radius: 10px;
          padding: 12px 24px;
          font-size: 14px;
          color: #00ff80;
          z-index: 9999;
          transition: transform 0.35s cubic-bezier(.2,.8,.3,1), opacity 0.35s;
          opacity: 0;
          white-space: nowrap;
        }
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast.error { border-color: rgba(255,80,80,0.4); color: #ff6060; }

        .hidden-canvas { display: none; }
      `}</style>

      <div className="page-bg">

        <div className="portal-badge">Portail Étudiant</div>
        <h1 className="page-title">
          Créer votre<br /><span>compte étudiant</span>
        </h1>
        <p className="page-subtitle">Formulaire d'inscription avec vérification faciale</p>

        <div className="card">

          <div className="section-label">Informations personnelles</div>

          <div className="form-row">
            <div className="form-group">
              <label>Nom</label>
              <input className="form-input" name="nom" placeholder="Ex: Benali"
                value={form.nom} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Prénom</label>
              <input className="form-input" name="prenom" placeholder="Ex: Amira"
                value={form.prenom} onChange={handleChange} />
            </div>
          </div>

          <div className="form-group">
            <label>Adresse e-mail</label>
            <input className="form-input" name="email_academique" type="email"
              placeholder="etudiant@univ.dz" value={form.email_academique} onChange={handleChange} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Année</label>
              <div className="select-wrapper">
                <select className="form-select" name="annee_scolaire"
                  value={form.annee_scolaire} onChange={handleChange}>
                  <option value="">Choisir</option>
                  {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Groupe</label>
              <div className="select-wrapper">
                <select className="form-select" name="classe"
                  value={form.classe} onChange={handleChange}>
                  <option value="">Choisir</option>
                  {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          <hr className="divider" />

          <div className="section-label">Reconnaissance faciale</div>

          <div className="face-scan-wrapper">

            <div className="cam-container">
              {camActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="cam-video"
                  />
                  <canvas
                    ref={canvasOverlayRef}
                    className="cam-overlay-canvas"
                    width={256}
                    height={256}
                  />
                </>
              ) : (
                <>
                  <div className="cam-inactive">
                    <div className="cam-inactive-icon">{scanComplete ? "✅" : "🙂"}</div>
                    <div className="cam-inactive-text">
                      {scanComplete ? "Scan terminé" : "Caméra inactive"}
                    </div>
                  </div>
                  <canvas
                    ref={canvasOverlayRef}
                    className="cam-overlay-canvas"
                    width={256}
                    height={256}
                  />
                </>
              )}
            </div>

            <div className="angle-dots">
              {ANGLES.map(a => (
                <div key={a.key} className={`angle-dot${capturedAngles[a.key] ? " done" : ""}`}>
                  <div className="dot-circle">{a.icon}</div>
                  <span>{a.label}</span>
                </div>
              ))}
            </div>

            {(camActive || completedCount > 0) && (
              <>
                <div className="progress-bar-bg" style={{ width: "100%" }}>
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-label">{completedCount} / {ANGLES.length} angles capturés</div>
              </>
            )}

            <p className={`instruction-text ${instructionClass}`}>{currentInstruction}</p>

            {!camActive && !scanComplete && (
              <button className="btn-scan" onClick={startCamera}>▶ Activer Face ID</button>
            )}
            {(camActive || scanComplete) && (
              <button className="btn-restart" onClick={restartScan}>↺ Recommencer</button>
            )}

          </div>

          <button
            className="btn-submit"
            onClick={handleSubmit}
            disabled={loading || !scanComplete}
          >
            {loading ? "Inscription en cours..." : "Créer mon compte →"}
          </button>

        </div>
      </div>

      <div className={`toast${toast.show ? " show" : ""}${toast.type === "error" ? " error" : ""}`}>
        {toast.msg}
      </div>

      <canvas ref={hiddenCanvasRef} className="hidden-canvas" />
    </>
  );
}