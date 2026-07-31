# Correction du Crash `toFixed` & Robustesse des Données

J'ai résolu le problème de crash qui survenait lors de la connexion de l'agent, tout en rendant le dashboard beaucoup plus résistant aux données manquantes ou partielles.

## Problème Identifié

Le crash `TypeError: Cannot read properties of undefined (reading 'toFixed')` se produisait car le code tentait de formater des chiffres qui n'existaient pas encore dans l'état (ou qui étaient absents de l'envoi de l'agent). Cela arrivait particulièrement sur les nouvelles métriques (vitesse 3D, boost turbo) ou lors de calculs d'alertes complexes.

## Solutions Apportées

### 1. Helper `safeNum`
J'ai introduit une fonction utilitaire `safeNum(val, dec)` qui :
- Vérifie si la valeur est un nombre fini.
- Retourne `0.00` (formaté selon la précision demandée) au lieu de planter si la valeur est `undefined`, `null` ou `NaN`.

### 2. Fusion Intelligente des Données
La fonction `handleTelemetry` a été mise à jour pour **fusionner** (`merge`) les nouvelles données avec les anciennes au lieu de les remplacer.
- **Bénéfice** : Si une version plus ancienne de l'agent n'envoie qu'une partie des données, les champs existants dans le dashboard ne sont pas supprimés (évitant les crashs en cascade).

### 3. Nettoyage de l'Export CSV & Alertes
Tous les points de sortie de données (Export CSV, logs d'alertes, tooltips) utilisent désormais ces garde-fous.

## Comment vérifier

1. **Relancez l'Agent** : Connectez-le normalement.
2. **Dashboard** : Le dashboard devrait maintenant s'afficher sans erreur dès la réception du premier paquet, même si certaines données sont à zéro.
3. **Stabilité** : Vous pouvez changer de véhicule ou de mode de course sans risque de crash lié au formatage.

render_diffs(file:///C:/Users/Thomas/Documents/GitHub/forza-telemetry-project/dashboard-client/src/App.jsx)
