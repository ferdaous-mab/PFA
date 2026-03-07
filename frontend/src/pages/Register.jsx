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

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

  :root {
    --bg: #050c1a;
    --card: #0a1628;
    --surface: #0d1f3c;
    --accent: #f5c400;
    --accent2: #ffd740;
    --blue3: #42a5f5;
    --border: #1a2f55;
    --border2: #243a66;
    --text: #e8f0fe;
    --muted: #5a7aaa;
    --success: #00e676;
    --error: #ff5252;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Outfit', sans-serif;
    min-height: 100vh;
  }

  .page-bg {
    min-height: 100vh;
    background:
      radial-gradient(ellipse at 20% 20%, rgba(21,101,192,0.18) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 80%, rgba(245,196,0,0.10) 0%, transparent 60%),
      var(--bg);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 40px 16px;
  }

  .wrapper { width: 100%; max-width: 580px; }

  header { text-align: center; margin-bottom: 32px; }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 16px;
    border-radius: 30px;
    background: rgba(245,196,0,0.10);
    border: 1px solid rgba(245,196,0,0.25);
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 18px;
  }

  .badge-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  header h1 { font-size: 34px; font-weight: 800; line-height: 1.15; margin-bottom: 10px; }
  header h1 em { font-style: normal; color: var(--accent); }
  header p { font-size: 14px; color: var(--muted); }

  .card {
    background: var(--card);
    padding: 32px;
    border-radius: 20px;
    border: 1px solid var(--border);
    box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  }

  .sec-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2.5px;
    color: var(--accent);
    text-transform: uppercase;
    margin-bottom: 18px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sec-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--border2), transparent);
  }

  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .field { margin-bottom: 18px; }

  label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 7px; color: var(--muted); }

  input, select {
    width: 100%;
    padding: 11px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text);
    font-family: 'Outfit', sans-serif;
    font-size: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none;
  }

  input::placeholder { color: var(--muted); }
  input:focus, select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(245,196,0,0.10);
  }

  select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235a7aaa' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
  }

  select option { background: var(--surface); }
  .divider { height: 1px; background: var(--border); margin: 24px 0; }

  .facescan-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px;
    text-align: center;
    margin-bottom: 24px;
  }

  .video-container {
    position: relative;
    width: 240px;
    height: 240px;
    margin: 0 auto 16px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg);
    border: 3px solid var(--border);
  }

  .cam-idle {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--muted);
    background: var(--bg);
    border-radius: 50%;
    z-index: 2;
  }

  .cam-idle-icon { font-size: 50px; opacity: 0.4; }
  .cam-idle-text { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; }

  .cam-video {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
    border-radius: 50%;
    z-index: 1;
  }

  .scan-overlay {
    position: absolute;
    top: -8px; left: -8px;
    width: calc(100% + 16px);
    height: calc(100% + 16px);
    pointer-events: none;
    z-index: 3;
  }

  .scan-instruction {
    font-size: 15px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 8px;
    min-height: 24px;
  }

  .scan-instruction.success { color: var(--success); }
  .scan-instruction.waiting { color: var(--muted); }

  .progress-bar-wrap {
    width: 100%;
    height: 6px;
    background: var(--border);
    border-radius: 10px;
    margin-bottom: 16px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 10px;
    background: linear-gradient(90deg, var(--accent), var(--blue3));
    transition: width 0.4s ease;
  }

  .angles-grid {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .angle-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    min-width: 56px;
    transition: all 0.3s;
    font-size: 11px;
    color: var(--muted);
  }

  .angle-chip.done {
    border-color: var(--success);
    background: rgba(0,230,118,0.08);
    color: var(--success);
  }

  .angle-chip.active {
    border-color: var(--accent);
    background: rgba(245,196,0,0.08);
    color: var(--accent);
    animation: chipPulse 1s ease-in-out infinite;
  }

  @keyframes chipPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  .angle-icon { font-size: 18px; }

  .btn-start {
    padding: 11px 24px;
    border: 1.5px solid var(--accent);
    background: transparent;
    color: var(--accent);
    border-radius: 30px;
    cursor: pointer;
    font-family: 'Outfit', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 1px;
    transition: background 0.2s;
  }

  .btn-start:hover { background: rgba(245,196,0,0.10); }

  .btn-restart {
    padding: 11px 24px;
    border: 1.5px solid var(--error);
    background: transparent;
    color: var(--error);
    border-radius: 30px;
    cursor: pointer;
    font-family: 'Outfit', sans-serif;
    font-size: 13px;
    font-weight: 600;
    margin-left: 10px;
    transition: background 0.2s;
  }

  .btn-restart:hover { background: rgba(255,82,82,0.10); }

  .btn-submit {
    width: 100%;
    padding: 14px;
    border: none;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    border-radius: 12px;
    color: #050c1a;
    font-family: 'Outfit', sans-serif;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.1s;
  }

  .btn-submit:hover { opacity: 0.92; transform: translateY(-1px); }
  .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .toast {
    position: fixed;
    top: 30px;
    left: 50%;
    transform: translateX(-50%) translateY(-80px);
    padding: 14px 26px;
    border-radius: 30px;
    font-size: 14px;
    font-weight: 600;
    z-index: 999;
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
  }

  .toast.show { transform: translateX(-50%) translateY(0); }
  .toast.success { background: var(--success); color: #000; }
  .toast.error { background: var(--error); color: #fff; }

  .hidden-canvas { display: none; }
`;

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
    ctx.strokeStyle = "rgba(26,47,85,0.8)";
    ctx.lineWidth = 6;
    ctx.stroke();

    if (prog > 0) {
      const angle = (prog / 100) * 2 * Math.PI - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, -Math.PI / 2, angle);
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, "#f5c400");
      grad.addColorStop(1, "#42a5f5");
      ctx.strokeStyle = grad;
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

  const startScanLoop = useCallback(() => {
    let lastSentTime = 0;
    const SCAN_INTERVAL = 1500;

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

            const angleName = ANGLES.find(a => a.key === detectedAngle)?.label;
            setCurrentInstruction(`✓ ${angleName} capturé !`);
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
                const nextInfo = ANGLES.find(a => a.key === next);
                setCurrentInstruction(`${nextInfo?.icon} ${getInstructionForAngle(next)}`);
                setInstructionClass("");
              }
            }, 800);

          } else if (!detectedAngle) {
            setCurrentInstruction("Positionnez votre visage dans le cercle");
            setInstructionClass("waiting");
          } else {
            const next = getNextAngle(capturedAnglesRef.current);
            if (next) {
              setCurrentInstruction(`${ANGLES.find(a => a.key === next)?.icon} ${getInstructionForAngle(next)}`);
              setInstructionClass("");
            }
          }
        }
      } catch (e) {
        // silencieux
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, [captureFrame, drawScanRing]);

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

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      capturedAnglesRef.current = {};
      setCapturedAngles({});
      setProgress(0);
      setScanComplete(false);
      setCamActive(true);
      setCurrentInstruction("😐 Regardez droit devant pour commencer");
      setInstructionClass("");
      drawScanRing(0);
      startScanLoop();
    } catch {
      setCurrentInstruction("Accès caméra refusé !");
      setInstructionClass("waiting");
    }
  };

  const restartScan = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (videoRef.current) videoRef.current.srcObject = null;
    capturedAnglesRef.current = {};
    setCamActive(false);
    setCapturedAngles({});
    setProgress(0);
    setScanComplete(false);
    setCurrentInstruction("Appuyez pour démarrer le scan");
    setInstructionClass("waiting");
    drawScanRing(0);
  };

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

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

    const formData = new FormData();
    formData.append("nom", nom);
    formData.append("prenom", prenom);
    formData.append("email_academique", email_academique);
    formData.append("classe", classe);
    formData.append("annee_scolaire", annee_scolaire);
    formData.append("image_face", captured["face"], "face.jpg");
    formData.append("image_gauche", captured["gauche"], "gauche.jpg");
    formData.append("image_droite", captured["droite"], "droite.jpg");
    formData.append("image_haut", captured["haut"], "haut.jpg");
    formData.append("image_bas", captured["bas"], "bas.jpg");
    formData.append("image_diag_gauche", captured["diag_gauche"], "diag_gauche.jpg");
    formData.append("image_diag_droite", captured["diag_droite"], "diag_droite.jpg");

    try {
      const res = await fetch("http://localhost:8000/api/students/inscrire-complet", {
        method: "POST",
        body: formData,
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
      <style>{styles}</style>
      <div className={`toast ${toast.show ? "show" : ""} ${toast.type}`}>{toast.msg}</div>

      <div className="page-bg">
        <div className="wrapper">
          <header>
            <div className="badge"><span className="badge-dot"></span>Portail Étudiant</div>
            <h1>Créer votre<br /><em>compte étudiant</em></h1>
            <p>Inscription avec scan facial 7 angles</p>
          </header>

          <div className="card">
            <div className="sec-label">Informations personnelles</div>

            <div className="row">
              <div className="field">
                <label>Nom</label>
                <input name="nom" value={form.nom} onChange={handleChange} placeholder="Ex: Benali" />
              </div>
              <div className="field">
                <label>Prénom</label>
                <input name="prenom" value={form.prenom} onChange={handleChange} placeholder="Ex: Amira" />
              </div>
            </div>

            <div className="field">
              <label>Adresse e-mail</label>
              <input name="email_academique" type="email" value={form.email_academique} onChange={handleChange} placeholder="etudiant@univ.dz" />
            </div>

            <div className="row">
              <div className="field">
                <label>Année scolaire</label>
                <select name="annee_scolaire" value={form.annee_scolaire} onChange={handleChange}>
                  <option value="">Choisir</option>
                  <option value="2023-2024">2023-2024</option>
                  <option value="2024-2025">2024-2025</option>
                  <option value="2025-2026">2025-2026</option>
                </select>
              </div>
              <div className="field">
                <label>Classe</label>
                <select name="classe" value={form.classe} onChange={handleChange}>
                  <option value="">Choisir</option>
                  <option value="1A">1ère Année</option>
                  <option value="2A">2ème Année</option>
                  <option value="3A">3ème Année</option>
                  <option value="4A">4ème Année</option>
                  <option value="5A">5ème Année</option>
                </select>
              </div>
            </div>

            <div className="divider"></div>
            <div className="sec-label">Scan facial — {completedCount}/7 angles</div>

            <div className="facescan-box">
              <div className="video-container">
                {/* Idle overlay */}
                {!camActive && !scanComplete && (
                  <div className="cam-idle">
                    <span className="cam-idle-icon">🔍</span>
                    <span className="cam-idle-text">Caméra inactive</span>
                  </div>
                )}

                {/* Scan complete overlay */}
                {scanComplete && (
                  <div className="cam-idle">
                    <span className="cam-idle-icon">✅</span>
                    <span className="cam-idle-text">Scan complet</span>
                  </div>
                )}

                {/* Video — toujours dans le DOM */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="cam-video"
                  style={{ display: camActive ? "block" : "none" }}
                />

                {/* Scan ring canvas */}
                <canvas ref={canvasOverlayRef} className="scan-overlay" width={256} height={256} />
              </div>

              <p className={`scan-instruction ${instructionClass}`}>{currentInstruction}</p>

              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>

              <div className="angles-grid">
                {ANGLES.map((a) => {
                  const isDone = !!capturedAngles[a.key];
                  const isActive = camActive && !isDone && a.key === getNextAngle(capturedAngles);
                  return (
                    <div key={a.key} className={`angle-chip ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}>
                      <span className="angle-icon">{isDone ? "✓" : a.icon}</span>
                      <span>{a.label}</span>
                    </div>
                  );
                })}
              </div>

              <div>
                {!camActive && !scanComplete && (
                  <button className="btn-start" onClick={startCamera}>
                    ▶ Démarrer le scan
                  </button>
                )}
                {(camActive || scanComplete) && (
                  <button className="btn-restart" onClick={restartScan}>
                    🔄 Recommencer
                  </button>
                )}
              </div>
            </div>

            <button className="btn-submit" onClick={handleSubmit} disabled={loading || !scanComplete}>
              {loading ? "Inscription en cours..." : "Créer mon compte →"}
            </button>
          </div>
        </div>
      </div>

      <canvas ref={hiddenCanvasRef} className="hidden-canvas" />
    </>
  );
}