import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import OpenAI from 'openai';
import { 
  User,
  Mail,
  Key,
  Home,
  Users,
  Palette,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Trash2,
  AlertCircle,
  Bell
} from "lucide-react";

interface UserData {
  pseudo: string;
  email: string;
  firstName?: string;
  lastName?: string;
  gender?: 'papa' | 'maman' | 'autre';
  phone?: string;
  familyInfo?: {
    children: number;
    childrenAges: string[];
  };
  preferences?: {
    theme: string;
    fontSize: string;
    notifications: boolean;
  };
}

export const Profile = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValues, setTempValues] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserData = async () => {
      if (!auth.currentUser) {
        navigate("/");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          setUserData({
            ...userDoc.data() as UserData,
            preferences: {
              theme: userDoc.data().preferences?.theme || 'light',
              fontSize: userDoc.data().preferences?.fontSize || 'medium',
              notifications: userDoc.data().preferences?.notifications !== false
            }
          });
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [navigate]);

  const handleNotificationToggle = async () => {
    if (!auth.currentUser || !userData) return;

    try {
      setSaving(true);
      const userRef = doc(db, "users", auth.currentUser.uid);
      const newNotificationValue = !userData.preferences?.notifications;

      await updateDoc(userRef, {
        'preferences.notifications': newNotificationValue
      });

      setUserData(prev => prev ? {
        ...prev,
        preferences: {
          ...prev.preferences,
          notifications: newNotificationValue
        }
      } : null);
    } catch (error) {
      console.error('Error updating notification preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  const validatePseudo = async (pseudo: string): Promise<boolean> => {
    try {
      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      });

      const prompt = `Ce pseudo est-il inapproprié, vulgaire ou à connotation sexuelle, moqueuse ou violente ? Cela inclut les formes camouflées ou fusionnées comme 'niketamer', 'put1', 'cacaboudin', etc. Si le pseudo est sain, positif ou neutre, réponds : ACCEPTÉ. Sinon : REFUSÉ. Réponds uniquement par ACCEPTÉ ou REFUSÉ.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nPseudo à vérifier : "${pseudo}"`
          }
        ],
        temperature: 0.7,
        max_tokens: 10
      });

      const response = completion.choices[0].message.content?.trim();
      return response === 'ACCEPTÉ';
    } catch (error) {
      console.error('Error validating pseudo:', error);
      return false;
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser || !editingField) return;

    try {
      setSaving(true);
      setValidationError(null);

      if (editingField === 'identity' && tempValues.pseudo !== userData?.pseudo) {
        const isValidPseudo = await validatePseudo(tempValues.pseudo);
        if (!isValidPseudo) {
          setValidationError("Ce pseudo n'est pas approprié. Veuillez en choisir un autre.");
          return;
        }
      }

      const userRef = doc(db, "users", auth.currentUser.uid);
      const updates: any = {};

      switch (editingField) {
        case 'identity':
          updates.pseudo = tempValues.pseudo;
          updates.firstName = tempValues.firstName;
          updates.lastName = tempValues.lastName;
          updates.gender = tempValues.gender;
          break;

        case 'contact':
          updates.phone = tempValues.phone;
          break;

        case 'family':
          updates.familyInfo = {
            children: parseInt(tempValues.children),
            childrenAges: tempValues.childrenAges.split(',').map((age: string) => age.trim())
          };
          break;

        case 'preferences':
          updates.preferences = {
            theme: tempValues.theme,
            fontSize: tempValues.fontSize
          };
          break;
      }

      await updateDoc(userRef, updates);
      setUserData(prev => prev ? { ...prev, ...updates } : null);
      setEditingField(null);
      setTempValues({});
    } catch (error) {
      console.error("Error updating user data:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser) return;

    try {
      setSaving(true);
      await deleteDoc(doc(db, "users", auth.currentUser.uid));
      await auth.currentUser.delete();
      navigate("/");
    } catch (error) {
      console.error("Error deleting account:", error);
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const sections = [
    {
      id: 'identity',
      icon: <User className="w-8 h-8 text-primary" />,
      title: "Identité",
      description: "Informations personnelles",
      fields: [
        { key: 'pseudo', label: 'Pseudo', value: userData?.pseudo },
        { key: 'firstName', label: 'Prénom', value: userData?.firstName },
        { key: 'lastName', label: 'Nom', value: userData?.lastName },
        { key: 'gender', label: 'Je suis', value: userData?.gender }
      ]
    },
    {
      id: 'contact',
      icon: <Mail className="w-8 h-8 text-primary" />,
      title: "Coordonnées",
      description: "Informations de contact",
      fields: [
        { key: 'email', label: 'Email', value: userData?.email, readonly: true },
        { key: 'phone', label: 'Téléphone', value: userData?.phone }
      ]
    },
    {
      id: 'family',
      icon: <Users className="w-8 h-8 text-primary" />,
      title: "Famille",
      description: "Informations sur vos enfants",
      fields: [
        { key: 'children', label: 'Nombre d\'enfants', value: userData?.familyInfo?.children },
        { key: 'childrenAges', label: 'Âges', value: userData?.familyInfo?.childrenAges?.join(', ') }
      ]
    },
    {
      id: 'preferences',
      icon: <Palette className="w-8 h-8 text-primary" />,
      title: "Préférences",
      description: "Personnalisation de l'interface",
      fields: [
        { 
          key: 'theme', 
          label: 'Thème', 
          value: userData?.preferences?.theme,
          type: 'select',
          options: [
            { value: 'light', label: 'Clair' },
            { value: 'dark', label: 'Sombre' }
          ]
        },
        { 
          key: 'fontSize', 
          label: 'Taille du texte', 
          value: userData?.preferences?.fontSize,
          type: 'select',
          options: [
            { value: 'small', label: 'Petite' },
            { value: 'medium', label: 'Moyenne' },
            { value: 'large', label: 'Grande' }
          ]
        }
      ]
    },
    {
      id: 'notifications',
      icon: <Bell className="w-8 h-8 text-primary" />,
      title: "Notifications",
      description: "Gérer vos préférences de notifications",
      fields: [
        { 
          key: 'notifications', 
          label: 'Activer les notifications', 
          value: userData?.preferences?.notifications,
          type: 'switch'
        }
      ]
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link to="/dashboard">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour au tableau de bord
            </Button>
          </Link>
          <Link to="/">
            <Button variant="outline" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Accueil
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
          <h1 className="text-3xl font-bold text-primary mb-8">
            Mes informations personnelles
          </h1>

          <div className="space-y-6">
            {sections.map((section) => (
              <Card key={section.id} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {section.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-semibold">{section.title}</h3>
                        <p className="text-gray-600">{section.description}</p>
                      </div>
                      {section.id === 'notifications' ? (
                        <Switch
                          checked={userData?.preferences?.notifications}
                          onCheckedChange={handleNotificationToggle}
                          disabled={saving}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingField(section.id);
                            setTempValues(
                              section.fields.reduce((acc, field) => ({
                                ...acc,
                                [field.key]: field.value || ''
                              }), {})
                            );
                          }}
                        >
                          Modifier
                        </Button>
                      )}
                    </div>
                    {section.id !== 'notifications' && (
                      <div className="space-y-2">
                        {section.fields.map((field) => (
                          <div key={field.key} className="flex items-center gap-2">
                            <span className="font-medium">{field.label}:</span>
                            <span className="text-gray-600">
                              {field.value || 'Non renseigné'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}

            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Key className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-4">Sécurité</h3>
                  <div className="space-y-4">
                    <Button
                      variant="outline"
                      className="w-full md:w-auto"
                      onClick={() => navigate("/reset-password")}
                    >
                      Changer mon mot de passe
                    </Button>
                    <Button
                      variant="destructive"
                      className="w-full md:w-auto"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Supprimer mon compte
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={!!editingField} onOpenChange={() => {
        setEditingField(null);
        setValidationError(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Modifier {sections.find(s => s.id === editingField)?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {validationError && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                {validationError}
              </div>
            )}
            {editingField && sections
              .find(s => s.id === editingField)
              ?.fields
              .filter(field => !field.readonly)
              .map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium mb-2">
                    {field.label}
                  </label>
                  {field.type === 'select' ? (
                    <Select
                      value={tempValues[field.key]}
                      onValueChange={(value) => 
                        setTempValues(prev => ({ ...prev, [field.key]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Choisir ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={tempValues[field.key]}
                      onChange={(e) => {
                        setValidationError(null);
                        setTempValues(prev => ({ ...prev, [field.key]: e.target.value }));
                      }}
                      placeholder={`Entrez ${field.label.toLowerCase()}`}
                    />
                  )}
                </div>
              ))
            }
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditingField(null);
                setValidationError(null);
              }}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !!validationError}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer mon compte</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600 mb-4">
              Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible 
              et toutes vos données seront définitivement supprimées.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Suppression...
                  </>
                ) : (
                  'Confirmer la suppression'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};