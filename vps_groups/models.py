from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime

# --- Enums & Constantes ---

ThemeGroupe = Literal['ecole', 'comportement', 'emotions', 'developpement', 'autre']
GroupeStatus = Literal['scheduled', 'in_progress', 'completed', 'cancelled', 'reprogrammed']

# --- Modèles de base ---

class StructureEtape(BaseModel):
    label: str
    dureeMinutes: int
    micMode: Optional[Literal['muted', 'free']] = 'free'

class ParticipantSimple(BaseModel):
    uid: str
    pseudo: str
    inscrit_vocal: bool = True
    date_inscription: datetime
    banni: bool = False

class SessionState(BaseModel):
    currentPhaseIndex: int = 0
    extendedMinutes: int = 0
    sessionActive: bool = True
    phaseStartedAt: datetime
    sessionStartedAt: datetime
    suspended: Optional[bool] = False
    suspensionReason: Optional[str] = None

# --- Modèles pour Groupes ---

class GroupCreate(BaseModel):
    id: str
    titre: str
    description: Optional[str] = None
    theme: ThemeGroupe = 'autre'
    createur_uid: str
    createur_pseudo: str
    date_vocal: datetime
    date_expiration: datetime
    structure_type: Literal['libre', 'structuree'] = 'libre'
    structure: List[StructureEtape] = []
    participants_max: int = 5

class GroupUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    theme: Optional[ThemeGroupe] = None
    status: Optional[GroupeStatus] = None
    cancel_reason: Optional[str] = None
    session_state: Optional[dict] = None # On stocke le dict JSONB
    participants_max: Optional[int] = None

class GroupResponse(BaseModel):
    id: str
    titre: str
    description: Optional[str] = None
    theme: ThemeGroupe
    createur_uid: str
    createur_pseudo: str
    date_vocal: datetime
    date_expiration: datetime
    status: GroupeStatus
    structure_type: str
    structure: List[StructureEtape]
    participants: List[ParticipantSimple] = []
    message_count: int = 0
    session_state: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

# --- Messages & Evaluations ---

class MessageCreate(BaseModel):
    id: str
    auteur_uid: str
    auteur_pseudo: str
    contenu: str

class MessageResponse(BaseModel):
    id: str
    groupe_id: str
    auteur_uid: str
    auteur_pseudo: str
    contenu: str
    date_envoi: datetime

class EvaluationCreate(BaseModel):
    participant_uid: str
    note_ambiance: int = Field(..., ge=1, le=5)
    note_theme: int = Field(..., ge=1, le=5)
    note_technique: int = Field(..., ge=1, le=5)
    ressenti: Optional[str] = None
