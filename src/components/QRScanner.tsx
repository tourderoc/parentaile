import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface QRScannerProps {
  onScan: (token: string) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const [isStarting, setIsStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const startScanner = async () => {
      try {
        const scannerId = 'qr-scanner-container';

        // Attendre que le container soit monté
        await new Promise(resolve => setTimeout(resolve, 100));

        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        await html5QrCode.start(
          { facingMode: 'environment' }, // Caméra arrière
          config,
          (decodedText) => {
            // QR code scanné avec succès
            console.log('QR Code scanné:', decodedText);

            // Extraire le token du QR code
            let token = decodedText;

            // Si c'est une URL, extraire le token
            if (decodedText.includes('token=')) {
              const url = new URL(decodedText);
              token = url.searchParams.get('token') || decodedText;
            } else if (decodedText.includes('/')) {
              // Si c'est un chemin, prendre la dernière partie
              const parts = decodedText.split('/');
              token = parts[parts.length - 1] || decodedText;
            }

            // Arrêter le scanner et retourner le token
            if (html5QrCode.isScanning) {
              html5QrCode.stop()
                .then(() => {
                  html5QrCode.clear();
                  scannerRef.current = null; // Important : éviter le double stop dans le cleanup
                  onScan(token.trim());
                })
                .catch((err) => {
                  console.error('Erreur lors de l\'arrêt du scanner:', err);
                  // Même en cas d'erreur, on essaie de continuer
                  scannerRef.current = null;
                  onScan(token.trim());
                });
            } else {
              scannerRef.current = null;
              onScan(token.trim());
            }
          },
          (errorMessage) => {
            // Erreur de scan (frame sans QR) - ignorer
            // Ne pas logger en production pour éviter le spam
          }
        );

        setIsStarting(false);
      } catch (err: any) {
        console.error('Erreur scanner:', err);
        setIsStarting(false);

        if (err.toString().includes('NotAllowedError') || err.toString().includes('Permission')) {
          setError('Veuillez autoriser l\'accès à la caméra pour scanner le QR code.');
        } else if (err.toString().includes('NotFoundError')) {
          setError('Aucune caméra trouvée sur cet appareil.');
        } else {
          setError('Impossible de démarrer la caméra. Essayez la saisie manuelle.');
        }
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
              scannerRef.current?.clear();
            }).catch((err) => {
              console.warn('Erreur cleanup scanner (non critique):', err);
            });
          } else {
            scannerRef.current.clear();
          }
        } catch (e) {
          console.warn('Erreur cleanup scanner (non critique):', e);
        }
      }
    };
  }, [onScan]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50 flex flex-col"
    >
      {/* Header */}
      <div className="bg-black/80 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Camera className="text-white" size={24} />
          <span className="text-white font-bold">Scanner le QR Code</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 bg-white/20 rounded-xl text-white"
        >
          <X size={20} />
        </button>
      </div>

      {/* Scanner Area */}
      <div className="flex-1 flex items-center justify-center relative">
        {isStarting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto" />
              <p className="text-white font-medium">Démarrage de la caméra...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10 p-6">
            <div className="bg-red-500/20 border border-red-500/50 rounded-3xl p-6 text-center space-y-4 max-w-sm">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
              <p className="text-white font-medium">{error}</p>
              <button
                onClick={onClose}
                className="w-full h-12 bg-white text-gray-800 rounded-2xl font-bold"
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        <div
          id="qr-scanner-container"
          ref={containerRef}
          className="w-full h-full"
          style={{ maxWidth: '100%', maxHeight: '70vh' }}
        />

        {/* Overlay avec cadre de scan */}
        {!isStarting && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative">
              {/* Coins du cadre */}
              <div className="w-64 h-64 relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-orange-500 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-orange-500 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-orange-500 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-orange-500 rounded-br-lg" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-black/80 px-6 py-6 text-center">
        <p className="text-white/60 text-sm font-medium">
          Placez le QR code du document médecin dans le cadre
        </p>
      </div>
    </motion.div>
  );
};

export default QRScanner;
