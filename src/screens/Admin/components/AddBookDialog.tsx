import React, { useState, useRef } from 'react';
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Plus, Loader2, Wand2, Upload } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import OpenAI from 'openai';

interface AddBookDialogProps {
  onBookAdded: () => void;
  type?: 'kids' | 'parents';
}

const DEFAULT_BOOK_IMAGE = "https://placehold.co/400x600?text=Image+non+disponible";

const ageRanges = {
  kids: ['3-5 ans', '6-9 ans', '9-12 ans'],
  parents: ['Tous âges']
};

const defaultThemes = {
  kids: [
    'Famille',
    'École',
    'Amitié',
    'Nature',
    'Aventure',
    'Émotions',
    'Fantaisie',
    'Animaux'
  ],
  parents: [
    'Parentalité',
    'Éducation',
    'Développement',
    'Psychologie',
    'Santé',
    'Famille',
    'Communication',
    'Bien-être'
  ]
};

const defaultEmotions = [
  'Joie',
  'Tristesse',
  'Colère',
  'Peur',
  'Confiance',
  'Amour',
  'Anxiété',
  'Calme'
];

export const AddBookDialog: React.FC<AddBookDialogProps> = ({ onBookAdded, type = 'kids' }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [amazonUrl, setAmazonUrl] = useState('');
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    short_description: '',
    description: '',
    age_range: '',
    price: '',
    amazon_link: '',
    image_url: '',
    themes: [] as string[],
    emotions: [] as string[],
    stock: 0 // Added stock field
  });

  const handleInputChange = (field: string, value: string | string[] | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleThemeToggle = (theme: string) => {
    setFormData(prev => ({
      ...prev,
      themes: prev.themes.includes(theme)
        ? prev.themes.filter(t => t !== theme)
        : [...prev.themes, theme]
    }));
  };

  const handleEmotionToggle = (emotion: string) => {
    setFormData(prev => ({
      ...prev,
      emotions: prev.emotions.includes(emotion)
        ? prev.emotions.filter(e => e !== emotion)
        : [...prev.emotions, emotion]
    }));
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image (JPG ou PNG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setLocalImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const extractJSONFromText = (text: string): string => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    if (start === -1 || end === -1) {
      throw new Error('No valid JSON object found in response');
    }
    
    return text.slice(start, end + 1);
  };

  const handleAIFill = async () => {
    if (!amazonUrl) return;

    setAiLoading(true);
    try {
      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      });

      const prompt = `Tu es un assistant qui aide à remplir une fiche produit pour un livre destiné à des parents ou à des enfants.

À partir du lien Amazon que je vais te fournir, lis la page et extrait uniquement les informations utiles pour pré-remplir une fiche de boutique.
Ne fais aucun résumé personnel, ne reformule pas.

📌 Extrait uniquement les éléments suivants (sous forme d'objet JSON) :

titre : titre exact du livre tel qu'il apparaît sur Amazon (sans sous-titre marketing)
description : description du livre (section éditeur, résumé, ou quatrième de couverture)
age : tranche d'âge cible si elle est indiquée (ex : "6–9 ans", "à partir de 3 ans")
auteur : nom de l'auteur (si présent)
imageUrl : laisser vide (l'image sera fournie manuellement)

❌ Ne récupère pas l'image Amazon ni le prix. Ignore tout ce qui concerne la livraison ou les formats Kindle.

✅ Fournis uniquement un objet JSON clair et complet

URL/Description: ${amazonUrl}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { 
            role: "system", 
            content: "Tu es un expert en analyse de livres. Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      try {
        const responseContent = completion.choices[0].message.content;
        if (!responseContent) {
          throw new Error('Empty response from AI');
        }
        
        const jsonStr = extractJSONFromText(responseContent);
        const response = JSON.parse(jsonStr);
        
        setFormData(prev => ({
          ...prev,
          title: response.titre || '',
          description: response.description || '',
          short_description: response.description?.slice(0, 100) || '',
          age_range: response.age || '',
          amazon_link: amazonUrl,
          themes: [],
          emotions: [],
          stock: 0 // Initialize stock to 0
        }));
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        alert('Failed to parse AI response. Please check the Amazon URL or description.');
      }
    } catch (error) {
      console.error('Error using AI to fill form:', error);
      alert('Failed to get AI response. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      const bookData = {
        ...formData,
        price: parseFloat(formData.price),
        image_url: formData.image_url || DEFAULT_BOOK_IMAGE,
        added_date: serverTimestamp(),
        isNew: true,
        stock: parseInt(formData.stock.toString()) // Ensure stock is a number
      };

      const collectionRef = collection(db, type === 'kids' ? 'livres_enfants' : 'livres_parents');
      await addDoc(collectionRef, bookData);
      
      setOpen(false);
      onBookAdded();
      
      setFormData({
        title: '',
        short_description: '',
        description: '',
        age_range: '',
        price: '',
        amazon_link: '',
        image_url: '',
        themes: [],
        emotions: [],
        stock: 0
      });
      setAmazonUrl('');
      setLocalImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error adding book:', error);
      alert('Une erreur est survenue lors de l\'ajout du livre');
    } finally {
      setLoading(false);
    }
  };

  const displayedImage = localImagePreview || formData.image_url || DEFAULT_BOOK_IMAGE;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un livre
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Ajouter un livre {type === 'kids' ? 'enfant' : 'parent'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          <div className="grid gap-4 py-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">
                  URL Amazon ou description
                </label>
                <Input
                  value={amazonUrl}
                  onChange={(e) => setAmazonUrl(e.target.value)}
                  placeholder="Collez l'URL Amazon ou décrivez le livre..."
                />
                <p className="text-sm text-gray-500 mt-1">
                  Cette fonction utilise le modèle GPT-4.0 pour extraire les informations complètes depuis un lien Amazon.
                </p>
              </div>
              <Button
                onClick={handleAIFill}
                disabled={!amazonUrl || aiLoading}
                variant="outline"
                className="flex items-center gap-2"
              >
                {aiLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                Pré-remplir avec IA
              </Button>
            </div>

            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Image du livre</label>
                <div className="flex gap-4 items-start">
                  <div className="w-32 h-48 relative">
                    <img
                      src={displayedImage}
                      alt="Aperçu du livre"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </div>
                  <div className="flex-1 space-y-4">
                    <Input
                      value={formData.image_url}
                      onChange={(e) => handleInputChange('image_url', e.target.value)}
                      placeholder="URL de l'image (optionnel)"
                    />
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Télécharger une image
                      </Button>
                      <p className="text-xs text-gray-500 mt-1">
                        L'image téléchargée sera uniquement affichée en aperçu
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Titre</label>
                <Input
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Titre du livre"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Description courte</label>
                <Input
                  value={formData.short_description}
                  onChange={(e) => handleInputChange('short_description', e.target.value)}
                  placeholder="Description courte (max 100 caractères)"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Description complète</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Description détaillée du livre"
                  className="min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Tranche d'âge</label>
                  <Select
                    value={formData.age_range}
                    onValueChange={(value) => handleInputChange('age_range', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une tranche d'âge" />
                    </SelectTrigger>
                    <SelectContent>
                      {ageRanges[type].map((range) => (
                        <SelectItem key={range} value={range}>
                          {range}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Prix (€)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => handleInputChange('price', e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Stock initial</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => handleInputChange('stock', parseInt(e.target.value))}
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Thèmes</label>
                <div className="flex flex-wrap gap-2">
                  {defaultThemes[type].map((theme) => (
                    <Button
                      key={theme}
                      type="button"
                      variant={formData.themes.includes(theme) ? "default" : "outline"}
                      onClick={() => handleThemeToggle(theme)}
                      className="text-sm"
                    >
                      {theme}
                    </Button>
                  ))}
                </div>
              </div>

              {type === 'kids' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Émotions</label>
                  <div className="flex flex-wrap gap-2">
                    {defaultEmotions.map((emotion) => (
                      <Button
                        key={emotion}
                        type="button"
                        variant={formData.emotions.includes(emotion) ? "default" : "outline"}
                        onClick={() => handleEmotionToggle(emotion)}
                        className="text-sm"
                      >
                        {emotion}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !formData.title || !formData.age_range || !formData.price}
            className="bg-primary hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Ajout en cours...
              </>
            ) : (
              'Ajouter ce livre'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};