# CyberGlobe — Unified Geometry

CyberGlobe est une visualisation 3D interactive de la Terre en **WebGL / Three.js**, conçue autour d’une architecture claire séparant **données géographiques**, **géométrie volumique** et **représentation visuelle**.

Ce dépôt correspond à l’état **UNIFIED (v2.1)** du projet.

---

## Objectif

Résoudre un problème fondamental de visualisation géographique 3D :

> Les frontières visibles ne doivent pas provenir de la triangulation des meshes,  
> mais des **coordonnées géographiques réelles** (longitude / latitude).

Le projet adopte donc une approche où :
- la triangulation sert uniquement à générer le volume,
- les frontières sont dessinées indépendamment, en overlay, à partir des données sources.

---

## Architecture

### 1. Géométrie volumique
- Chargement des pays depuis un fichier **GeoJSON**.
- Conversion longitude / latitude → coordonnées sphériques.
- Extrusion prismatique par pays.
- Triangulation réalisée avec **Earcut**, utilisée uniquement pour le volume.
- Géométrie reconstruite dynamiquement lors des changements de paramètres.

### 2. Frontières (overlay)
- Les frontières visibles ne sont **pas** issues de `EdgesGeometry`.
- Elles sont générées à partir des coordonnées réelles des polygones.
- Seul le **ring extérieur** de chaque polygone est rendu :
  - pas de frontières internes entre pays,
  - continents unifiés visuellement.
- Les lignes sont légèrement décalées radialement pour éviter le Z-fighting.

### 3. Atmosphère et éclairage
- Atmosphère simple et stable (shader minimal).
- Halo contrôlé uniquement par intensité et couleur.
- Éclairage directionnel + rim light pour accentuer les volumes.
- Aucun bruit ou effet décoratif non maîtrisé.

---

## Interface (Cockpit)

Le cockpit expose uniquement les paramètres réellement utilisés par le moteur.

### Geometry
- Extrusion Height
- Globe Radius
- Atmosphere Radius

### Glass Material
- Transmission
- Roughness
- Metalness
- Clearcoat

### Atmosphere
- Intensity
- Color Out

### Lighting
- Sun Intensity / Color
- Rim Intensity / Color
- Ambient Intensity

### Camera & Environment
- Fog Density
- Rotation Speed
- Field of View (FOV)

Les valeurs affichées sont synchronisées avec l’état interne au chargement.

---

## Données

- Source GeoJSON :  
  https://github.com/johan/world.geo.json
- Les données sont utilisées sans modification sémantique.
- Aucune simplification ou décimation automatique à ce stade.

---

## Choix techniques assumés

- Pas de frontières dérivées de la triangulation.
- Pas de wireframe basé sur les arêtes des triangles.
- Pas de grille ou d’effets décoratifs inutiles.
- Priorité donnée à la **cohérence géométrique** et à la lisibilité du code.

---

## État du projet

- ✅ Architecture stabilisée
- ✅ Géométrie et frontières découplées
- ✅ Reconstruction dynamique propre
- ❌ Pas encore optimisé (LOD, décimation, batching)
- ❌ Pas pensé comme produit final

Ce dépôt fige un **état fonctionnel et sain**, servant de base à des itérations futures.

---

## Stack technique

- Three.js r128
- WebGL
- GLSL (Vertex / Fragment)
- Earcut (triangulation polygonale)
- GeoJSON
- HTML / CSS / JavaScript vanilla

Aucune étape de build, aucun bundler.

---

## Licence

Projet expérimental.
Données géographiques issues de sources publiques.
Utilisation libre à des fins personnelles ou éducatives.

---

## Auteur

Développé par **Franck**  
Projet expérimental WebGL / Three.js
