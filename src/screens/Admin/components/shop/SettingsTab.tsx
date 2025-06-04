import React, { useState } from 'react';
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import { AlertCircle, Loader2 } from 'lucide-react';

export const SettingsTab = () => {
  const [testMode, setTestMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateTestOrder = async () => {
    try {
      setSaving(true);
      setError(null);

      // Create a test order logic here
      // This would typically create a fake order without processing payment

    } catch (error) {
      console.error('Error creating test order:', error);
      setError('Une erreur est survenue lors de la création de la commande test');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Mode test</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600">
              Activer le mode test pour créer des commandes fictives
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Les commandes test n'affectent pas le stock réel
            </p>
          </div>
          <Switch
            checked={testMode}
            onCheckedChange={setTestMode}
          />
        </div>

        {testMode && (
          <div className="mt-6 space-y-4">
            <Button
              onClick={handleCreateTestOrder}
              disabled={saving}
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Création en cours...
                </>
              ) : (
                'Créer une commande test'
              )}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Configuration Stripe</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Clé publique Stripe
            </label>
            <Input
              type="text"
              placeholder="pk_test_..."
              disabled
              value="Configuration automatique"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Clé secrète Stripe
            </label>
            <Input
              type="password"
              placeholder="sk_test_..."
              disabled
              value="••••••••••••"
            />
          </div>
          <p className="text-sm text-gray-500">
            Les clés Stripe sont gérées automatiquement via les variables d'environnement
          </p>
        </div>
      </Card>
    </div>
  );
};