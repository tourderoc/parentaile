import React, { useState, useEffect } from 'react';
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Brain, Loader2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AIPrompt, getAllPrompts, updatePrompt } from '../../../lib/prompts';

export const PromptsSection = () => {
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<AIPrompt | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const fetchedPrompts = await getAllPrompts();
      setPrompts(fetchedPrompts);
    } catch (error) {
      console.error('Error fetching prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingPrompt) return;

    try {
      setSaving(true);
      setError(null);

      await updatePrompt(editingPrompt.id, editingPrompt.content);
      await fetchPrompts();
      setEditingPrompt(null);
    } catch (error) {
      console.error('Error updating prompt:', error);
      setError('Une erreur est survenue lors de la mise à jour du prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefault = () => {
    if (!editingPrompt) return;
    setEditingPrompt({
      ...editingPrompt,
      content: editingPrompt.defaultContent
    });
  };

  const filteredPrompts = prompts.filter(prompt => 
    filter === 'all' || prompt.function === filter
  );

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold text-primary">🧠 Gestion des prompts IA</h2>
        </div>
        <select
          className="border rounded-md px-3 py-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Tous les prompts</option>
          <option value="boutique">Boutique</option>
          <option value="forum">Forum</option>
          <option value="consultation">Consultation</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-4">Nom</th>
              <th className="text-left py-3 px-4">Fonction</th>
              <th className="text-left py-3 px-4">Dernière modification</th>
              <th className="text-right py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPrompts.map((prompt) => (
              <tr key={prompt.id} className="border-b">
                <td className="py-3 px-4">{prompt.name}</td>
                <td className="py-3 px-4">{prompt.function}</td>
                <td className="py-3 px-4">
                  {prompt.updatedAt ? 
                    format(prompt.updatedAt, 'dd MMMM yyyy à HH:mm', { locale: fr }) :
                    'Jamais modifié'
                  }
                </td>
                <td className="py-3 px-4 text-right">
                  <Button
                    variant="outline"
                    onClick={() => setEditingPrompt(prompt)}
                  >
                    Modifier
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editingPrompt} onOpenChange={(open) => !open && setEditingPrompt(null)}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Modifier le prompt : {editingPrompt?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
                {error}
              </div>
            )}

            <Textarea
              value={editingPrompt?.content}
              onChange={(e) => setEditingPrompt(prev => 
                prev ? { ...prev, content: e.target.value } : null
              )}
              className="min-h-[400px] font-mono text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleRestoreDefault}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Version par défaut
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditingPrompt(null)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
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
    </Card>
  );
};