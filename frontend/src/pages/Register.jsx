import React, { useRef, useState, useEffect, useCallback } from "react";

const ANGLES = [
  { key: "face",        label: "Face"        },
  { key: "gauche",      label: "Gauche"      },
  { key: "droite",      label: "Droite"      },
  { key: "haut",        label: "Haut"        },
  { key: "bas",         label: "Bas"         },
  { key: "diag_gauche", label: "Diag Gauche" },
  { key: "diag_droite", label: "Diag Droite" },
];

const ANNEES  = ["1ère année", "2ème année", "3ème année", "4ème année", "5ème année"];
const CLASSES = ["A", "B", "C", "D"];

const INSTRUCTIONS_ORDER = [
  { key: "face",        text: "Regardez droit devant"     },
  { key: "gauche",      text: "Tournez lentement à gauche (les diagonales se capturent automatiquement)" },
  { key: "droite",      text: "Tournez lentement à droite (les diagonales se capturent automatiquement)" },
  { key: "haut",        text: "Regardez vers le haut"     },
  { key: "bas",         text: "Regardez vers le bas"      },
  { key: "diag_gauche", text: "Continuez à bouger..."     },
  { key: "diag_droite", text: "Continuez à bouger..."     },
];

function getNextInstruction(captured) {
  const next = INSTRUCTIONS_ORDER.find(a => !captured[a.key]);
  return next ? next.text : "Continuez à bouger librement...";
}

export default function RegisterPage() {
  const videoRef          = useRef(null);
  const canvasOverlayRef  = useRef(null);
  const hiddenCanvasRef   = useRef(null);
  const streamRef         = useRef(null);
  const animFrameRef      = useRef(null);
  const capturedAnglesRef = useRef({});
  const canvasRef         = useRef(null);

  const [camActive,          setCamActive]          = useState(false);
  const [capturedAngles,     setCapturedAngles]     = useState({});
  const [currentInstruction, setCurrentInstruction] = useState("");
  const [instructionClass,   setInstructionClass]   = useState("waiting");
  const [progress,           setProgress]           = useState(0);
  const [scanComplete,       setScanComplete]        = useState(false);
  const [loading,            setLoading]             = useState(false);
  const [toast,              setToast]               = useState({ show: false, msg: "", type: "success" });
  const [form, setForm] = useState({
    nom: "", prenom: "", email_academique: "", classe: "", annee_scolaire: ""
  });

  const showToast = (msg, type = "success") => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  // ── Animated background particles ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.4,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.45 + 0.08,
    }));
    let t = 0;
    const draw = () => {
      t += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const auroras = [
        { x: 0.15 + Math.sin(t*0.7)*0.08, y: 0.25 + Math.cos(t*0.5)*0.1,  r: 0.65, c: "rgba(30,144,255," },
        { x: 0.82 + Math.cos(t*0.6)*0.07, y: 0.65 + Math.sin(t*0.8)*0.08, r: 0.55, c: "rgba(255,215,0,"  },
        { x: 0.5  + Math.sin(t*0.4)*0.12, y: 0.88 + Math.cos(t*0.9)*0.06, r: 0.45, c: "rgba(0,112,224,"  },
        { x: 0.7  + Math.cos(t*1.1)*0.06, y: 0.1  + Math.sin(t*0.6)*0.08, r: 0.38, c: "rgba(30,144,255," },
      ];
      auroras.forEach(({ x, y, r, c }) => {
        const g = ctx.createRadialGradient(canvas.width*x, canvas.height*y, 0, canvas.width*x, canvas.height*y, canvas.width*r);
        g.addColorStop(0, c + "0.22)"); g.addColorStop(0.5, c + "0.08)"); g.addColorStop(1, c + "0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      });
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;  if (p.x > canvas.width)  p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(30,144,255,${p.alpha})`; ctx.fill();
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 100) {
            ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(30,144,255,${0.08*(1-dist/100)})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  // ── Scan ring ───────────────────────────────────────────────────
  const drawScanRing = useCallback((prog) => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const size = canvas.width, cx = size/2, cy = size/2, radius = size/2 - 10;
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 2*Math.PI);
    ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 3; ctx.stroke();
    if (prog > 0) {
      const end = (prog/100) * 2*Math.PI - Math.PI/2;
      ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI/2, end);
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, "#1E90FF"); grad.addColorStop(1, "#FFD700");
      ctx.strokeStyle = grad; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.stroke();
    }
    const fs = size * 0.52, fx = (size-fs)/2, fy = (size-fs)/2;
    const cL = 20, cR = 9;
    const col = prog === 100 ? "#FFD700" : "rgba(30,144,255,0.7)";
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    [[fx,fy,1,1],[fx+fs,fy,-1,1],[fx,fy+fs,1,-1],[fx+fs,fy+fs,-1,-1]].forEach(([ox,oy,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(ox+sx*cL, oy+sy*cR);
      ctx.arcTo(ox+sx*cR, oy+sy*cR, ox+sx*cR, oy+sy*cL, cR);
      ctx.lineTo(ox+sx*cR, oy+sy*cL); ctx.stroke();
    });
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current, canvas = hiddenCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise(r => canvas.toBlob(b => r(b), "image/jpeg", 0.85));
  }, []);

  const startScanLoop = useCallback(() => {
    let last = 0;
    const loop = async () => {
      if (!streamRef.current) return;
      const now = Date.now();
      // ── Scan toutes les 400ms (plus réactif qu'avant) ──
      if (now - last < 400) { animFrameRef.current = requestAnimationFrame(loop); return; }
      last = now;
      const blob = await captureFrame();
      if (!blob) { animFrameRef.current = requestAnimationFrame(loop); return; }
      try {
        const cur = capturedAnglesRef.current;
        const alreadyCaptured = Object.keys(cur).join(",");

        const fd = new FormData();
        fd.append("image", blob, "frame.jpg");
        fd.append("already_captured", alreadyCaptured); // ← envoyer les angles déjà capturés

        const res = await fetch("http://localhost:8000/api/students/scan-angle", { method: "POST", body: fd });
        if (res.ok) {
          const { angle: det, instruction } = await res.json();
          if (det && !cur[det]) {
            const updated = { ...cur, [det]: blob };
            capturedAnglesRef.current = updated;
            setCapturedAngles({ ...updated });
            const prog = (Object.keys(updated).length / ANGLES.length) * 100;
            setProgress(prog);
            drawScanRing(prog);
            setCurrentInstruction(`✓ ${ANGLES.find(a => a.key === det)?.label} capturé !`);
            setInstructionClass("success");

            if (Object.keys(updated).length >= ANGLES.length) {
              setScanComplete(true);
              setCurrentInstruction("✓ Scan terminé avec succès !");
              streamRef.current?.getTracks().forEach(t => t.stop());
              streamRef.current = null;
              setCamActive(false);
              return;
            }
            // Après 800ms, afficher la prochaine instruction
            setTimeout(() => {
              setCurrentInstruction(getNextInstruction(updated));
              setInstructionClass("");
            }, 800);
          } else if (!det) {
            // Afficher l'instruction du backend si aucun angle capturé
            setCurrentInstruction(instruction || getNextInstruction(cur));
            setInstructionClass("");
          }
        }
      } catch (e) { console.error(e); }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [captureFrame, drawScanRing]);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = s;
      capturedAnglesRef.current = {};
      setCapturedAngles({}); setProgress(0); setScanComplete(false); setCamActive(true);
      setCurrentInstruction("Regardez droit devant"); setInstructionClass("");
    } catch { setCurrentInstruction("Accès caméra refusé"); setInstructionClass("waiting"); }
  };

  useEffect(() => {
    if (camActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
      drawScanRing(0);
      startScanLoop();
    }
  // eslint-disable-next-line
  }, [camActive]);

  const restartScan = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    capturedAnglesRef.current = {};
    setCamActive(false); setCapturedAngles({}); setProgress(0);
    setScanComplete(false); setCurrentInstruction(""); setInstructionClass("waiting");
    drawScanRing(0);
  };

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    const { nom, prenom, email_academique, classe, annee_scolaire } = form;
    if (!nom || !prenom || !email_academique || !classe || !annee_scolaire)
      return showToast("Veuillez remplir tous les champs.", "error");
    if (!scanComplete) return showToast("Veuillez compléter le scan.", "error");
    setLoading(true);
    const fd = new FormData();
    Object.entries({ nom, prenom, email_academique, classe, annee_scolaire }).forEach(([k, v]) => fd.append(k, v));
    ANGLES.forEach(a => fd.append(`image_${a.key}`, capturedAnglesRef.current[a.key], `${a.key}.jpg`));
    try {
      const res  = await fetch("http://localhost:8000/api/students/inscrire-complet", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        showToast(`✓ ${data.message}`, "success");
        setForm({ nom: "", prenom: "", email_academique: "", classe: "", annee_scolaire: "" });
        restartScan();
      } else showToast(data.detail || "Erreur inscription.", "error");
    } catch { showToast("Impossible de contacter le serveur.", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const c = canvasOverlayRef.current;
    if (c) { c.width = 280; c.height = 280; }
    drawScanRing(0);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [drawScanRing]);

  const completedCount = Object.keys(capturedAngles).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080c18; font-family: 'Plus Jakarta Sans', sans-serif; color: #e2e8f0; overflow-x: hidden; }
        .bg-canvas { position: fixed; inset: 0; z-index: 0; pointer-events: none; background: linear-gradient(135deg, #080c18 0%, #0d1224 50%, #080e1c 100%); }
        .page-bg { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 0 16px 60px; }
        .hero { width: 100%; max-width: 520px; text-align: center; padding: 32px 0 24px; position: relative; }
        .hero-icon-wrap { position: relative; display: inline-block; margin-bottom: 18px; }
        .hero-icon-halo { position: absolute; inset: -28px; background: radial-gradient(circle, rgba(30,144,255,0.35) 0%, transparent 70%); border-radius: 50%; animation: haloPulse 3s ease-in-out infinite; pointer-events: none; }
        @keyframes haloPulse { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:1; transform:scale(1.2); } }
        .hero-icon { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px; background: linear-gradient(145deg, #1E90FF 0%, #0060cc 55%, #0040aa 100%); border-radius: 22px; box-shadow: 0 0 0 1px rgba(255,255,255,0.12), 0 8px 32px rgba(30,144,255,0.55), 0 24px 64px rgba(30,144,255,0.28), inset 0 1px 0 rgba(255,255,255,0.2); animation: iconFloat 4s ease-in-out infinite; overflow: hidden; }
        @keyframes iconFloat { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-8px); } }
        .hero-title { font-family:'Outfit',sans-serif; font-size:30px; font-weight:800; line-height:1.15; margin-bottom:10px; letter-spacing:-0.8px; animation:fadeUp 0.6s ease both; }
        .hero-title .line1 { color:#ffffff; display:block; text-shadow:0 2px 40px rgba(30,144,255,0.35); }
        .hero-tagline { font-size:13px; font-weight:400; color:#5a6480; line-height:1.6; animation:fadeUp 0.75s ease both; padding:0 4px; }
        .hero-tagline strong { background:linear-gradient(90deg,#1E90FF,#FFD700); -webkit-background-clip:text; -webkit-text-fill-color:transparent; font-weight:600; }
        .hero-line { width:40px; height:2px; background:linear-gradient(90deg,transparent,#1E90FF,#FFD700,transparent); border-radius:99px; margin:14px auto 0; animation:fadeUp 0.9s ease both; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        .card { width:100%; max-width:460px; background:rgba(15,20,35,0.85); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.07); border-radius:24px; padding:32px 28px; box-shadow:0 32px 80px rgba(0,0,0,0.5),0 0 0 1px rgba(30,144,255,0.08),inset 0 1px 0 rgba(255,255,255,0.05); animation:fadeUp 1.2s ease both; }
        .section-label { font-size:9px; font-weight:700; letter-spacing:3px; color:#1E90FF; text-transform:uppercase; margin-bottom:18px; display:flex; align-items:center; gap:8px; }
        .section-label::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,rgba(30,144,255,0.3),transparent); }
        .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
        .form-group { display:flex; flex-direction:column; gap:7px; margin-bottom:14px; }
        .form-group label { font-size:11px; color:#475569; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; }
        .form-input,.form-select { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:11px 14px; color:#e2e8f0; font-size:14px; font-family:inherit; outline:none; transition:border-color 0.2s,box-shadow 0.2s,background 0.2s; width:100%; appearance:none; -webkit-appearance:none; }
        .form-input::placeholder { color:#334155; }
        .form-input:focus,.form-select:focus { border-color:rgba(30,144,255,0.5); background:rgba(30,144,255,0.05); box-shadow:0 0 0 3px rgba(30,144,255,0.08); }
        .select-wrapper { position:relative; }
        .select-wrapper::after { content:'▾'; position:absolute; right:12px; top:50%; transform:translateY(-50%); color:#1E90FF; pointer-events:none; font-size:12px; }
        .form-select option { background:#0f1423; color:#e2e8f0; }
        .divider { border:none; margin:24px 0; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent); }
        .face-scan-wrapper { display:flex; flex-direction:column; align-items:center; gap:18px; }
        .cam-container { position:relative; width:min(280px,80vw); height:min(280px,80vw); border-radius:50%; overflow:hidden; background:#050810; box-shadow:0 0 0 3px rgba(30,144,255,0.2),0 0 0 6px rgba(30,144,255,0.07),0 0 60px rgba(30,144,255,0.2),0 20px 60px rgba(0,0,0,0.5); }
        .cam-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transform:scaleX(-1); z-index:1; }
        .cam-overlay-canvas { position:absolute; inset:0; width:100%; height:100%; z-index:2; pointer-events:none; }
        .cam-inactive { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; z-index:1; background:radial-gradient(circle at 50% 40%,#0d1535 0%,#050810 100%); }
        .faceid-icon { width:52px; height:52px; }
        .cam-inactive-text { font-size:9px; letter-spacing:3.5px; color:#4a5568; text-transform:uppercase; font-weight:700; font-family:'Outfit',sans-serif; }
        .cam-instruction-overlay { position:absolute; bottom:0; left:0; right:0; z-index:3; padding:18px 16px; background:linear-gradient(to top,rgba(5,8,16,0.85) 0%,transparent 100%); text-align:center; }
        .cam-instruction-text { font-size:12px; font-weight:600; color:#e2e8f0; text-shadow:0 1px 6px rgba(0,0,0,0.8); letter-spacing:0.2px; font-family:'Outfit',sans-serif; }
        .cam-instruction-text.success { color:#67e8f9; }

        /* ── Angle badges ── */
        .angle-badges { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; width:100%; max-width:280px; }
        .angle-badge { font-size:10px; font-weight:600; padding:4px 10px; border-radius:99px; font-family:'Outfit',sans-serif; letter-spacing:0.3px; transition:all 0.3s; }
        .angle-badge.done { background:rgba(30,144,255,0.15); border:1px solid rgba(30,144,255,0.4); color:#1E90FF; }
        .angle-badge.pending { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); color:#334155; }

        .progress-track { width:min(280px,80vw); height:2px; background:rgba(255,255,255,0.06); border-radius:99px; overflow:hidden; }
        .progress-fill { height:100%; background:linear-gradient(90deg,#1E90FF,#FFD700); border-radius:99px; transition:width 0.5s cubic-bezier(.4,0,.2,1); box-shadow:0 0 12px rgba(30,144,255,0.5); }
        .progress-count { font-size:11px; color:#334155; font-weight:600; letter-spacing:1px; font-family:'Outfit',sans-serif; }
        .progress-count span { color:#1E90FF; }
        .btn-scan { display:inline-flex; align-items:center; gap:10px; background:linear-gradient(135deg,#1E90FF 0%,#0070e0 60%,#FFD700 100%); background-size:200% auto; border:none; border-radius:999px; padding:12px 30px; color:#fff; font-size:13px; font-weight:700; cursor:pointer; font-family:'Outfit',sans-serif; letter-spacing:0.5px; box-shadow:0 4px 24px rgba(30,144,255,0.4); transition:background-position 0.4s,box-shadow 0.2s,transform 0.15s; }
        .btn-scan:hover { background-position:right center; box-shadow:0 6px 32px rgba(30,144,255,0.5); transform:translateY(-1px); }
        .btn-restart { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:7px 18px; color:#475569; font-size:12px; cursor:pointer; font-family:inherit; transition:all 0.2s; letter-spacing:0.3px; }
        .btn-restart:hover { border-color:rgba(30,144,255,0.4); color:#1E90FF; }
        .btn-submit { width:100%; padding:14px; background:linear-gradient(135deg,#1E90FF 0%,#0070e0 60%,#FFD700 100%); background-size:200% auto; border:none; border-radius:14px; color:#fff; font-size:15px; font-weight:700; cursor:pointer; margin-top:24px; font-family:'Outfit',sans-serif; letter-spacing:0.3px; box-shadow:0 4px 24px rgba(30,144,255,0.35); transition:background-position 0.4s,box-shadow 0.2s,transform 0.15s,opacity 0.2s; }
        .btn-submit:hover:not(:disabled) { background-position:right center; box-shadow:0 8px 36px rgba(30,144,255,0.5); transform:translateY(-1px); }
        .btn-submit:disabled { opacity:0.25; cursor:not-allowed; transform:none; }
        .toast { position:fixed; bottom:32px; left:50%; transform:translateX(-50%) translateY(80px); background:rgba(15,20,35,0.95); backdrop-filter:blur(20px); border:1px solid rgba(30,144,255,0.35); border-radius:14px; padding:13px 26px; font-size:13px; color:#1E90FF; font-weight:600; z-index:9999; transition:transform 0.35s cubic-bezier(.2,.8,.3,1),opacity 0.35s; opacity:0; white-space:nowrap; font-family:'Outfit',sans-serif; box-shadow:0 8px 40px rgba(0,0,0,0.5); }
        .toast.show { transform:translateX(-50%) translateY(0); opacity:1; }
        .toast.error { border-color:rgba(239,68,68,0.3); color:#f87171; }
        .hidden-canvas { display:none; }
        @media (max-width:480px) {
          .hero { padding:24px 0 18px; } .hero-title { font-size:24px; } .hero-tagline { font-size:12px; }
          .card { padding:22px 16px; border-radius:18px; } .form-row { grid-template-columns:1fr; gap:0; }
          .btn-scan { padding:11px 22px; font-size:12px; } .btn-submit { font-size:14px; padding:13px; }
          .hero-icon { width:58px; height:58px; border-radius:17px; }
        }
      `}</style>

      <canvas ref={canvasRef} className="bg-canvas" />
      <div className="page-bg">
        <div className="hero">
          <div className="hero-icon-wrap">
            <div className="hero-icon-halo" />
            <div className="hero-icon">
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                <path d="M19 9L4 17l15 8 15-8-15-8z" fill="#FFD700"/>
                <path d="M10 21v8c0 0 3 6 9 6s9-6 9-6v-8" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <line x1="34" y1="17" x2="34" y2="26" stroke="rgba(255,255,255,0.65)" strokeWidth="2.2" strokeLinecap="round"/>
                <circle cx="34" cy="27.5" r="2" fill="rgba(255,255,255,0.65)"/>
              </svg>
            </div>
          </div>
          <h1 className="hero-title"><span className="line1">ESISA Portail Étudiant</span></h1>
          <p className="hero-tagline">Votre avenir commence ici — <strong>inscrivez-vous et rejoignez l'élite.</strong></p>
          <div className="hero-line" />
        </div>

        <div className="card">
          <div className="section-label">Informations personnelles</div>
          <div className="form-row">
            <div className="form-group">
              <label>Nom</label>
              <input className="form-input" name="nom" placeholder="Ex: Benali" value={form.nom} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Prénom</label>
              <input className="form-input" name="prenom" placeholder="Ex: Amira" value={form.prenom} onChange={handleChange} />
            </div>
          </div>
          <div className="form-group">
            <label>Adresse e-mail académique</label>
            <input className="form-input" name="email_academique" type="email" placeholder="etudiant@esisa.ac.ma" value={form.email_academique} onChange={handleChange} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Année</label>
              <div className="select-wrapper">
                <select className="form-select" name="annee_scolaire" value={form.annee_scolaire} onChange={handleChange}>
                  <option value="">Choisir</option>
                  {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Classe</label>
              <div className="select-wrapper">
                <select className="form-select" name="classe" value={form.classe} onChange={handleChange}>
                  <option value="">Choisir</option>
                  {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="divider" />
          <div className="section-label">Reconnaissance faciale</div>

          <div className="face-scan-wrapper">
            <div className="cam-container">
              {camActive ? (
                <>
                  <video ref={videoRef} autoPlay muted playsInline className="cam-video" />
                  <canvas ref={canvasOverlayRef} className="cam-overlay-canvas" width={280} height={280} />
                  <div className="cam-instruction-overlay">
                    <span className={`cam-instruction-text ${instructionClass}`}>{currentInstruction}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="cam-inactive">
                    <svg className="faceid-icon" viewBox="0 0 52 52" fill="none">
                      <path d="M4 15V9a5 5 0 015-5h6M37 4h6a5 5 0 015 5v6M48 37v6a5 5 0 01-5 5h-6M15 48H9a5 5 0 01-5-5v-6" stroke="url(#g1)" strokeWidth="2.5" strokeLinecap="round"/>
                      <circle cx="19" cy="22" r="3" fill="url(#g1)" opacity="0.8"/>
                      <circle cx="33" cy="22" r="3" fill="url(#g1)" opacity="0.8"/>
                      <path d="M19 34s2.5 5 7 5 7-5 7-5" stroke="url(#g2)" strokeWidth="2.5" strokeLinecap="round"/>
                      <path d="M26 22v7" stroke="url(#g1)" strokeWidth="2" strokeLinecap="round"/>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse"><stop stopColor="#1E90FF"/><stop offset="1" stopColor="#0070e0"/></linearGradient>
                        <linearGradient id="g2" x1="0" y1="0" x2="52" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#1E90FF"/><stop offset="1" stopColor="#FFD700"/></linearGradient>
                      </defs>
                    </svg>
                    <div className="cam-inactive-text">{scanComplete ? "Scan terminé" : "Face ID"}</div>
                  </div>
                  <canvas ref={canvasOverlayRef} className="cam-overlay-canvas" width={280} height={280} />
                  {scanComplete && (
                    <div className="cam-instruction-overlay">
                      <span className="cam-instruction-text success">✓ Identité enregistrée</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Angle badges ── */}
            {(camActive || completedCount > 0) && (
              <div className="angle-badges">
                {ANGLES.map(a => (
                  <span key={a.key} className={`angle-badge ${capturedAngles[a.key] ? "done" : "pending"}`}>
                    {capturedAngles[a.key] ? "✓ " : ""}{a.label}
                  </span>
                ))}
              </div>
            )}

            {(camActive || completedCount > 0) && (
              <>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-count">
                  <span>{completedCount}</span> / {ANGLES.length} angles capturés
                </div>
              </>
            )}

            {!camActive && !scanComplete && (
              <button className="btn-scan" onClick={startCamera}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <circle cx="7.5" cy="7.5" r="6.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
                  <circle cx="7.5" cy="7.5" r="3" fill="#fff"/>
                </svg>
                Activer Face ID
              </button>
            )}
            {(camActive || scanComplete) && (
              <button className="btn-restart" onClick={restartScan}>↺ Recommencer</button>
            )}
          </div>

          <button className="btn-submit" onClick={handleSubmit} disabled={loading || !scanComplete}>
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