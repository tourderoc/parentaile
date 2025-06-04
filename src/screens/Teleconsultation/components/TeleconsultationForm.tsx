import React, { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Loader2 } from "lucide-react";

interface TeleconsultationFormProps {
  onSubmit: (formData: any) => void;
  isSubmitting: boolean;
}

const themes = [
  { value: 'crises', label: 'Crises' },
  { value: 'sommeil', label: 'Sommeil' },
  { value: 'scolarite', label: 'Scolarité' },
  { value: 'anxiete', label: 'Anxiété' },
  { value: 'fatigue', label: 'Fatigue parentale' },
  { value: 'autre', label: 'Autre' }
];

export const TeleconsultationForm: React.FC<TeleconsultationFormProps> = ({
  onSubmit,
  isSubmitting
}) => {
  const [formData, setFormData] = useState({
    situation: '',
    pseudo: '',
    childAge: '',
    theme: '',
    themeDetails: '',
    email: '',
    wantsPhoneContact: 'no',
    phone: '',
    understandsLimitations: false,
    acceptsPrivacyPolicy: false
  });

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary mb-4">
          🦋 Préparez votre consultation Parent'aile
        </h1>
        <div className="bg-primary/5 p-6 rounded-lg text-gray-600">
          <p className="mb-4">
            Ce temps d'échange n'est pas un avis médical, ni un suivi thérapeutique.
          </p>
          <p className="mb-4">
            Il s'agit d'un moment pour faire le point sur votre situation, être écouté 
            sans jugement, et identifier ensemble quelques premières pistes de réflexion.
          </p>
          <p>
            Vos informations resteront strictement confidentielles et seront supprimées 
            après la consultation.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Label className="text-lg font-medium text-primary">
          Exprimez votre situation
        </Label>
        <Textarea
          value={formData.situation}
          onChange={(e) => handleChange('situation', e.target.value)}
          placeholder="Décrivez votre situation, vos préoccupations, vos questions…"
          className="min-h-[200px] resize-none"
          required
        />
      </div>

      <div className="space-y-6 bg-white/50 p-6 rounded-lg">
        <h2 className="text-lg font-medium text-primary">
          Quelques informations utiles
        </h2>
        
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Pseudo ou prénom</Label>
            <Input
              value={formData.pseudo}
              onChange={(e) => handleChange('pseudo', e.target.value)}
              placeholder="Comment souhaitez-vous être appelé(e) ?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Âge de l'enfant</Label>
            <Input
              type="number"
              value={formData.childAge}
              onChange={(e) => handleChange('childAge', e.target.value)}
              placeholder="En années"
              min="0"
              max="18"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Thématique principale</Label>
            <Select
              value={formData.theme}
              onValueChange={(value) => handleChange('theme', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisissez une thématique" />
              </SelectTrigger>
              <SelectContent>
                {themes.map((theme) => (
                  <SelectItem key={theme.value} value={theme.value}>
                    {theme.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.theme === 'autre' && (
            <div className="space-y-2">
              <Label>Précisez si besoin</Label>
              <Input
                value={formData.themeDetails}
                onChange={(e) => handleChange('themeDetails', e.target.value)}
                placeholder="Précisez votre thématique"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6 bg-white/50 p-6 rounded-lg">
        <h2 className="text-lg font-medium text-primary">
          Coordonnées pour la réponse
        </h2>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Adresse e-mail</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="votre@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Souhaitez-vous être recontacté par téléphone ?</Label>
            <RadioGroup
              value={formData.wantsPhoneContact}
              onValueChange={(value) => handleChange('wantsPhoneContact', value)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="phone-yes" />
                <Label htmlFor="phone-yes">Oui</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="phone-no" />
                <Label htmlFor="phone-no">Non</Label>
              </div>
            </RadioGroup>
          </div>

          {formData.wantsPhoneContact === 'yes' && (
            <div className="space-y-2">
              <Label>Numéro de téléphone</Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="Votre numéro de téléphone"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 bg-white/50 p-6 rounded-lg">
        <h2 className="text-lg font-medium text-primary">Confidentialité</h2>
        
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="limitations"
              checked={formData.understandsLimitations}
              onCheckedChange={(checked) => 
                handleChange('understandsLimitations', checked as boolean)
              }
              required
            />
            <Label htmlFor="limitations" className="text-sm leading-tight">
              Je comprends que cette demande n'est pas une consultation médicale, 
              mais un temps d'échange ponctuel.
            </Label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="privacy"
              checked={formData.acceptsPrivacyPolicy}
              onCheckedChange={(checked) => 
                handleChange('acceptsPrivacyPolicy', checked as boolean)
              }
              required
            />
            <Label htmlFor="privacy" className="text-sm leading-tight">
              J'accepte que mes informations soient utilisées uniquement pour 
              répondre à cette demande, et qu'elles seront supprimées après l'échange.
            </Label>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary hover:bg-primary/90 text-white px-8 py-3"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            'Envoyer ma demande'
          )}
        </Button>
      </div>
    </form>
  );
};