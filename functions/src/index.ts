// Cloud Functions Parent'aile
// Les fonctions ont été migrées vers le VPS (account-service) :
// - manageVocalTasks → cron systemd vocal-reminders (toutes les 2 min)
// - handleVocalReminder → endpoint POST /notifications/cron/vocal-reminders
// - getLiveKitToken → endpoint POST /groupes/{id}/token
// - cleanupCancelledGroup → webhook LiveKit POST /livekit/webhook
//
// Ce fichier est conservé vide pour ne pas casser le build Firebase.
// Il pourra être supprimé quand le projet Firebase Functions sera décommissionné.

export {};
