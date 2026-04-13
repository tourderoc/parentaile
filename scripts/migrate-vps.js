import admin from 'firebase-admin';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';

dotenv.config();

// Configuration
const API_URL = process.env.VITE_ACCOUNT_API_URL || 'https://account.parentaile.fr';
const API_KEY = process.env.VITE_ACCOUNT_API_KEY;

// Chemin vers le compte de service (trouvé lors de la recherche)
const serviceAccountPath = path.join(os.homedir(), 'Documents', 'MedCompanion', 'pilotage', 'firebase_service_account.json');

if (!fs.existsSync(serviceAccountPath)) {
    console.error(`Erreur: Fichier de compte de service introuvable à : ${serviceAccountPath}`);
    process.exit(1);
}

// Initialisation Firebase
admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')))
});

const db = admin.firestore();

async function migrate() {
    console.log('--- Démarrage de la migration Firestore -> VPS ---');
    console.log(`Cible : ${API_URL}`);

    const snapshot = await db.collection('accounts').get();
    console.log(`\n📦 Trouvé ${snapshot.size} comptes sur Firebase.`);

    let successCount = 0;
    let ignoredCount = 0;
    let errorCount = 0;

    for (const doc of snapshot.docs) {
        const uid = doc.id;
        const data = doc.data();

        console.log(`\n[${uid}] Traitement de : ${data.pseudo || 'Sans pseudo'}...`);

        try {
            // 1. Vérifier si le compte existe déjà
            const checkRes = await fetch(`${API_URL}/accounts/${uid}`, {
                headers: { 'X-Api-Key': API_KEY }
            });

            if (checkRes.status === 200) {
                console.log(`   - [IGNORE] Déjà présent sur le VPS.`);
                ignoredCount++;
                continue;
            }

            // 2. Préparer les données pour le VPS
            const accountPayload = {
                uid: uid,
                email: data.email || null,
                pseudo: data.pseudo || "Utilisateur",
                avatar: data.avatar || null,
                points: data.points || 0,
                badge: data.badge || null,
                role: data.role || 'user',
                participation_history: data.participation_history || [],
                avatar_gen_count: data.avatar_gen_count || 0,
                fcm_token: data.fcm_token || null
                // Note: les serveurs VPS gèrent souvent les timestamps auto
            };

            // 3. Envoyer au VPS
            const pushRes = await fetch(`${API_URL}/accounts`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Api-Key': API_KEY 
                },
                body: JSON.stringify(accountPayload)
            });

            if (!pushRes.ok) {
                const err = await pushRes.text();
                throw new Error(`Erreur API (${pushRes.status}): ${err}`);
            }

            console.log(`   - [OK] Compte créé.`);
            successCount++;

            // 4. Migrer les enfants
            const childrenSnapshot = await doc.ref.collection('children').get();
            if (!childrenSnapshot.empty) {
                console.log(`   - 👦 Migration de ${childrenSnapshot.size} enfant(s)...`);
                for (const childDoc of childrenSnapshot.docs) {
                    const child = childDoc.data();
                    await fetch(`${API_URL}/accounts/${uid}/children`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Api-Key': API_KEY 
                        },
                        body: JSON.stringify({
                            token_id: childDoc.id,
                            nickname: child.nickname || "Enfant"
                        })
                    });
                }
            }

        } catch (err) {
            console.error(`   - [ERREUR] ${err.message}`);
            errorCount++;
        }
    }

    console.log('\n--- Fin de la migration ---');
    console.log(`✅ Succès : ${successCount}`);
    console.log(`⏳ Ignorés : ${ignoredCount}`);
    console.log(`❌ Échecs : ${errorCount}`);
    console.log('---------------------------');
}

migrate();
