import React, { useEffect } from "react";
import "./Register.css";

function RegisterPage() {
  // équivalent de ton script.js
  useEffect(() => {
    let stream = null;
    let progress = 0;
    let interval = null;

    function startFaceID() {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(function (s) {
          stream = s;
          document.getElementById("camVideo").srcObject = stream;
          document.getElementById("camWrap").style.display = "block";
          document.getElementById("faceIdle").style.display = "none";
          document.getElementById("faceStatus").innerText = "Scan du visage...";
          startScan();
        })
        .catch(() => alert("Accès caméra refusé"));
    }

    function startScan() {
      let canvas = document.getElementById("scanCanvas");
      let ctx = canvas.getContext("2d");
      canvas.width = 220;
      canvas.height = 220;

      interval = setInterval(() => {
        progress += 2;
        drawProgress(ctx, progress);
        if (progress >= 100) {
          clearInterval(interval);
          document.getElementById("faceStatus").innerText = "Face ID enregistré ✓";
        }
      }, 80);
    }

    function drawProgress(ctx, p) {
      ctx.clearRect(0, 0, 220, 220);
      let center = 110;
      let radius = 100;
      ctx.beginPath();
      ctx.arc(center, center, radius, -Math.PI / 2, (p / 100) * 2 * Math.PI - Math.PI / 2);
      ctx.strokeStyle = "#00e676";
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    function submitForm() {
      let nom = document.getElementById("nom").value;
      let prenom = document.getElementById("prenom").value;
      let email = document.getElementById("email").value;

      if (!nom || !prenom || !email) {
        alert("Remplissez tous les champs");
        return;
      }

      document.getElementById("toast").style.display = "block";
      setTimeout(() => {
        document.getElementById("toast").style.display = "none";
      }, 3000);
    }

    // attacher les fonctions aux boutons
    document.getElementById("btnFace")?.addEventListener("click", startFaceID);
    document.querySelector(".btn-submit")?.addEventListener("click", submitForm);
  }, []);

  return (
    <div className="wrapper">
      <div className="toast" id="toast">✓ Inscription réussie !</div>

      <header>
        <div className="badge"><span></span>Portail Étudiant</div>
        <h1>Créer votre <br /><em>compte étudiant</em></h1>
        <p>Formulaire d'inscription avec vérification faciale</p>
      </header>

      <div className="card">
        <div className="sec-label">Informations personnelles</div>

        <div className="row">
          <div className="field">
            <label>Nom</label>
            <input type="text" id="nom" />
          </div>
          <div className="field">
            <label>Prénom</label>
            <input type="text" id="prenom" />
          </div>
        </div>

        <div className="field">
          <label>Email</label>
          <input type="email" id="email" />
        </div>

        <div className="row">
          <div className="field">
            <label>Année</label>
            <select id="annee">
              <option value="">Choisir</option>
              <option>1ère Année</option>
              <option>2ème Année</option>
              <option>3ème Année</option>
              <option>4ème Année</option>
              <option>5ème Année</option>
            </select>
          </div>
          <div className="field">
            <label>Groupe</label>
            <select id="groupe">
              <option value="">Choisir</option>
              <option>Groupe A</option>
              <option>Groupe B</option>
              <option>Groupe C</option>
            </select>
          </div>
        </div>

        <div className="divider"></div>

        <div className="sec-label">Reconnaissance faciale</div>
        <div className="faceid-box">
          <div className="face-idle" id="faceIdle">CAMÉRA INACTIVE</div>
          <div className="cam-wrap" id="camWrap">
            <video id="camVideo" autoPlay muted playsInline></video>
            <canvas id="scanCanvas"></canvas>
          </div>
          <div className="face-status" id="faceStatus">Appuyez pour activer la caméra</div>
          <button className="btn-faceid" id="btnFace">Activer Face ID</button>
        </div>

        <button className="btn-submit">Créer mon compte</button>
      </div>
    </div>
  );
}

export default RegisterPage;