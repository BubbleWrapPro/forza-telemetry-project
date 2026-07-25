# Forza Telemetry Dashboard

Un tableau de bord interactif en temps réel exploitant les données télémétriques de la franchise Forza (Horizon / Motorsport). Ce projet intercepte le flux réseau UDP généré par le jeu, le traite via un serveur relais local et diffuse les métriques vers une application web React hébergée à distance.

## 📋 Table des matières
- [Architecture et Workflow](#architecture-et-workflow)
- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Installation et Configuration](#installation-et-configuration)
  - [1. Base de données (Supabase)](#1-base-de-données-supabase)
  - [2. Serveur Relais (Backend)](#2-serveur-relais-backend)
  - [3. Application Client (Frontend)](#3-application-client-frontend)
- [Configuration du Jeu](#configuration-du-jeu)
- [Déploiement](#déploiement)
- [Utilisation](#utilisation)

## 🏗 Architecture et Workflow

Le projet est divisé en deux composants principaux communiquant via WebSockets.

1. **Forza (Client Jeu) :** Génère un flux de données UDP (jusqu'à 60 fps) contenant l'état physique du véhicule.
2. **Relais Node.js (Local) :** Écoute le port UDP sur la machine Windows, désérialise le buffer binaire (Little-Endian) et extrait les données. Il enregistre les temps au tour en base de données et diffuse le reste du flux via WebSocket.
3. **Tunnel ngrok :** Expose le serveur WebSocket local via une URL sécurisée (HTTPS) pour contourner les restrictions CORS et Mixed-Content des navigateurs.
4. **Dashboard React (Distant) :** Interface web hébergée de manière statique. Elle se connecte au tunnel ngrok, consomme les événements WebSocket et met à jour l'interface utilisateur à 60 fps.

## ✨ Fonctionnalités
- Affichage de la vitesse et du régime moteur (RPM) en temps réel.
- Indicateur visuel du rapport de boîte de vitesses engagé.
- G-Meter (Heatmap) interactif généré sur un composant Canvas.
- Enregistrement automatique des temps au tour persistés en base de données.
- Interface optimisée en *Dark Mode*.

## 🛠 Prérequis
- **OS :** Windows 11 (pour exécuter le jeu et le serveur relais simultanément).
- **Environnement :** Node.js (LTS).
- **Outils :** Visual Studio Code, Git, ngrok.
- **Services Cloud :** 
  - Un compte Supabase (pour la persistance des données).
  - Un hébergement Alwaysdata (pour le déploiement des fichiers statiques).

## 🚀 Installation et Configuration

Clonez le dépôt sur votre machine locale :
```bash
git clone <URL_DU_REPO>
cd forza-telemetry-project
```

### 1. Base de données (Supabase)

Exécutez le script SQL suivant dans le SQL Editor de votre projet Supabase pour initialiser la table et verrouiller les accès via RLS :

```sql
CREATE TABLE laptimes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  lap_time numeric NOT NULL
);

ALTER TABLE laptimes ENABLE ROW LEVEL SECURITY;

```

### 2. Serveur Relais (Backend)

Ce service doit tourner en local sur la même boucle réseau que le jeu.

```bash
cd relay-server
npm install

```

Créez un fichier `.env` à la racine de `relay-server` avec vos identifiants Supabase :

```env
SUPABASE_URL=[https://votre-projet-id.supabase.co](https://votre-projet-id.supabase.co)
SUPABASE_SERVICE_ROLE_KEY=votre_cle_secrète_service_role

```

### 3. Application Client (Frontend)

L'interface web développée avec Vite et React.

```bash
cd ../dashboard-client
npm install
```

Créez un fichier `.env` ou `.env.local` à la racine de `dashboard-client` avec votre URL ngrok :

```env
VITE_NGROK_URL=https://votre-url-ngrok.ngrok-free.app
```

Ne poussez pas ce fichier dans votre dépôt : il contient une URL personnelle ngrok.

Dans `vite.config.js`, assurez-vous que les chemins relatifs sont activés pour le build :

```javascript
export default defineConfig({
  plugins: [react()],
  base: './',
})
```

## 🎮 Configuration du Jeu

Dans les paramètres de Forza (HUD et Gameplay) :

* **Sortie de données (Data Out) :** Activé
* **Adresse IP :** `127.0.0.1`
* **Port :** `5607`

## 🌍 Déploiement

1. **Génération de l'URL sécurisée :**
Lancez un tunnel ngrok pour exposer votre port local 3000.
```bash
ngrok http 3000

```


2. **Configuration du Frontend :**
Copiez l'URL HTTPS fournie par ngrok dans `dashboard-client/.env` :
```env
VITE_NGROK_URL=https://votre-url-ngrok.ngrok-free.app
```

3. **Build :**
```bash
npm run build

```


4. **Hébergement :**
Transférez le contenu du dossier `dashboard-client/dist/` à la racine de votre site de type "Fichiers statiques" sur Alwaysdata via FTP.

> Si ngrok n'est pas installé, téléchargez-le ici : https://ngrok.com/download
> 
> Créez un compte ngrok pour obtenir une URL stable et garder votre URL privée hors du code.

## 🏁 Utilisation

L'ordre de lancement est critique pour le bon établissement des connexions réseau.

1. Démarrez le serveur relais en local :
```bash
cd relay-server
node index.js

```


2. Démarrez le tunnel ngrok (si ce n'est pas déjà fait).
3. Accédez à votre URL Alwaysdata (ex: `https://votre-domaine.alwaysdata.net`) depuis le navigateur de votre choix (PC, tablette, smartphone).
4. Lancez une session de conduite dans Forza. Les données s'afficheront instantanément sur le dashboard.