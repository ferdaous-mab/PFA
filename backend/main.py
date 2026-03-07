from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.config import engine, Base
from routes.students import router as students_router

# Créer l'application FastAPI
app = FastAPI(title="PFA - Gestion Intelligente des Étudiants")

# Configurer CORS pour autoriser le frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # URL du frontend React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Créer les tables au démarrage si elles n'existent pas
Base.metadata.create_all(bind=engine)

# Connecter les routes
app.include_router(students_router, prefix="/api/students", tags=["Étudiants"])


@app.get("/")
def root():
    return {"message": "Backend PFA opérationnel !"}