

Visualisation 3D interactive de la Terre en **WebGL / Three.js**, combinant :
- extrusion prismatique des pays à partir de données GeoJSON,
- matériaux verre (glass / transmission),
- grille procédurale animée (shader),
- halo atmosphérique (corona),
- champ d’étoiles GLSL,
- contrôles temps réel (UI).

Projet orienté **démo technique / expérimentation shader / data-viz**.

---

## Démo

Projet autonome côté client.  
Ouvrir le fichier `index.html` dans un navigateur moderne (Chrome, Edge, Firefox).

---

## Stack technique

- **Three.js r128**
- **WebGL**
- **GLSL (Vertex / Fragment shaders)**
- **Earcut** (triangulation polygonale)
- **GeoJSON** (frontières pays)
- HTML / CSS / JavaScript vanilla

Aucune dépendance build (pas de bundler).

---

## Fonctionnalités principales

### Globe
- Sphère océan (`SphereGeometry`)
- Groupe global avec rotation automatique optionnelle

### Pays (Land Masses)
- Chargement GeoJSON des pays
- Conversion longitude / latitude → coordonnées sphériques
- Extrusion prismatique plane par pays
- Matériau verre (`MeshPhysicalMaterial`)
- Bordures via `EdgesGeometry`

### Grille technologique
- Shader procédural (pas de texture)
- Animation contrôlée par slider
- Superposition additive transparente

### Atmosphère / Corona
- Shader GLSL personnalisé
- Effet halo avec bruit simple
- Intensité réglable en temps réel

### Étoiles
- Starfield GLSL
- Points avec taille variable
- Placement sphérique aléatoire

### UI
- Sliders temps réel :
  - hauteur d’extrusion (rechargement requis)
  - opacité du verre
  - teinte des terres
  - vitesse de la grille
  - intensité du halo
- Pause / reprise rotation
- FPS (approximation)
- Compteur de triangles

---

## Structure du code

```

index.html
├─ CSS (UI + layout)
├─ Three.js scene
│  ├─ Camera
│  ├─ Lights
│  ├─ Controls
│  └─ Renderer
├─ Shaders
│  ├─ Stars
│  ├─ Corona
│  └─ Grid
├─ Géométrie
│  ├─ Conversion lon/lat
│  └─ Extrusion prismatique (Earcut)
├─ Data
│  └─ GeoJSON pays
└─ Animation loop

````

---

## Paramètres clés

Dans `CONFIG` :

```js
const CONFIG = {
  radius: 5,
  extrudeDepth: 0.05,
  geoJsonUrl: 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',
  autoRotate: true,
  rotateSpeed: 0.0005
};
````

---

## Limitations connues

* La hauteur d’extrusion nécessite un **rechargement** (reconstruction géométrique).
* Nombre élevé de draw calls (un mesh par pays).
* FPS indicatif, non moyenné.
* Gestion de la transparence perfectible selon l’angle caméra.
* Version Three.js non récente (volontairement stable).

---

## Pistes d’amélioration

* Fusion des géométries (`BufferGeometryUtils`)
* Instancing pour les overlays
* Calcul correct du view direction dans le shader corona
* Moyenne FPS glissante
* Migration vers Three.js récent (r150+)
* Rebuild dynamique de l’extrusion avec debounce
* Séparation des shaders en fichiers dédiés

---

## Objectif du projet

* Exploration shader (verre, halo, grille)
* Data-visualisation géographique stylisée
* Démonstration WebGL sans framework lourd
* Base pour installation artistique ou visualisation temps réel

---

## Licence

Projet expérimental.
Données GeoJSON issues de sources publiques.
Utilisation libre à des fins personnelles ou éducatives.

---

## Auteur

Développé par **Franck**
Projet expérimental WebGL / Three.js

```

---

