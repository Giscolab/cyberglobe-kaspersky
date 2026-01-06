import * as THREE from "https://esm.sh/three";
import { OrbitControls } from "https://esm.sh/three/addons/controls/OrbitControls.js";

/* ------------------------------------------------------------
   CONFIG
------------------------------------------------------------ */
const CONFIG = {
    radius: 3.4,
    extrudeDepth: 0.1,
    colorOcean: 0x020205,
    colorGlow: 0x00ffcc,
    geoJsonUrl: "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json",
    autoRotate: true,
    rotateSpeed: 0.0005,
    borderOffset: 0.1
};

/* ------------------------------------------------------------
   VARIABLES GLOBALES
------------------------------------------------------------ */
let showInternalBorders = true;
let showSharedOnly = false;
let scene, camera, renderer, controls;
let raycaster, mouse, hoveredMeshes, labelEl;
let globeGroup, countriesGroup, bordersGroup;
let ocean, atmosphere;
let baseCountryMaterial, oceanMat, coronaMaterial, borderMaterial, internalBorderMaterial;
let sunLight, rimLight, ambientLight;
let internalBorderIndex = new Map();

/* ------------------------------------------------------------
   INITIALISATION
------------------------------------------------------------ */
function init() {
    initScene();
    initLighting();
    initMaterials();
    initGlobe();
    initUI();
    initEventListeners();
    loadGeoJSON();
    initStars();
    animate(0);
}


/* ------------------------------------------------------------
   SCENE
------------------------------------------------------------ */
function initScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 16;
    camera.position.y = 4;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000);
    document.getElementById("canvas-container").appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 30;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    hoveredMeshes = new Set();
    labelEl = document.getElementById("country-label");
}

/* ------------------------------------------------------------
   UI
------------------------------------------------------------ */
function initUI() {
    // Sync des valeurs initiales
    syncDisplay("geo-extrude", "val-geo-extrude");
    syncDisplay("geo-radius", "val-geo-radius");
    syncDisplay("geo-atmo-rad", "val-geo-atmo-rad");
    syncDisplay("glass-trans", "val-glass-trans");
    syncDisplay("glass-rough", "val-glass-rough");
    syncDisplay("glass-metal", "val-glass-metal");
    syncDisplay("glass-clear", "val-glass-clear");
    syncDisplay("corona-int", "val-corona-int");
    
    // appliquer l’état initial depuis l’UI (source de vérité)
    const atmoInput = document.getElementById("geo-atmo-rad");
    if (atmoInput) {
        const val = parseFloat(atmoInput.value);
        const s = 1 + (val / 0.8);
        atmosphere.scale.set(s, s, s);
    }

    // Géométrie
    bindInput("geo-extrude", (val) => {
        CONFIG.extrudeDepth = val;
        rebuildExtrusion(val);
    }, "val-geo-extrude");

    bindInput("geo-radius", (val) => {
        CONFIG.radius = val;
        rebuildRadius(val);
    }, "val-geo-radius");

    bindInput("geo-atmo-rad", (val) => {
        const s = 1 + (val / 0.8);
        atmosphere.scale.set(s, s, s);
    }, "val-geo-atmo-rad");

    // Matériau Verre
    bindInput("glass-trans", (v) => updateMaterial("transmission", v), "val-glass-trans");
    bindInput("glass-rough", (v) => updateMaterial("roughness", v), "val-glass-rough");
    bindInput("glass-metal", (v) => updateMaterial("metalness", v), "val-glass-metal");
    bindInput("glass-clear", (v) => updateMaterial("clearcoat", v), "val-glass-clear");

    // Atmosphère
    bindInput("corona-int", (v) => {
        coronaMaterial.uniforms.intensity.value = parseFloat(v);
    }, "val-corona-int");

    bindInput("corona-col1", (v) => {
        coronaMaterial.uniforms.color1.value = new THREE.Color(v);
    });

    // Lumière
    bindInput("light-sun-int", (v) => { sunLight.intensity = parseFloat(v); });
    bindInput("light-sun-col", (v) => { sunLight.color.set(v); });
    bindInput("light-rim-int", (v) => { rimLight.intensity = parseFloat(v); });
    bindInput("light-rim-col", (v) => { rimLight.color.set(v); });
    bindInput("light-amb-int", (v) => { ambientLight.intensity = parseFloat(v); });

    // Environnement & Caméra
    bindInput("env-fog", (v) => { scene.fog.density = parseFloat(v); });
    bindInput("env-rot", (v) => { CONFIG.rotateSpeed = parseFloat(v); });
    bindInput("cam-fov", (v) => {
        camera.fov = parseFloat(v);
        camera.updateProjectionMatrix();
    });
}

/* ------------------------------------------------------------
   LUMIÈRES
------------------------------------------------------------ */
function initLighting() {
    ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0x831f84, 3.0);
    sunLight.position.set(10, 10, 10);
    scene.add(sunLight);

    const blueLight = new THREE.DirectionalLight(0x0088ff, 0.5);
    blueLight.position.set(-5, 0, 5);
    scene.add(blueLight);

    rimLight = new THREE.SpotLight(0x000000, 10.0);
    rimLight.position.set(-15, 5, -10);
    rimLight.lookAt(0, 0, 0);
    scene.add(rimLight);
}

/* ------------------------------------------------------------
   MATÉRIAUX
------------------------------------------------------------ */
function initMaterials() {
    // SHADERS
    const coronaVS = `
        varying vec3 v_normal;
        void main() {
            v_normal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const coronaFS = `
        varying vec3 v_normal;
        uniform vec3 color1;
        uniform float intensity;
        uniform float time;
        void main() {
            float viewAngle = dot(v_normal, vec3(0,0,1));
            float glow = pow(0.6 - viewAngle, 2.5);
            vec3 finalColor = mix(vec3(0.0), color1, glow);
            gl_FragColor = vec4(finalColor, 1.0) * glow * intensity;
        }
    `;

    // Matériaux
    baseCountryMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x00ffcc,
    metalness: 0.0,
    roughness: 0.0,
    transmission: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    emissive: 0x000000,
    emissiveIntensity: 0
});


    oceanMat = new THREE.MeshPhysicalMaterial({
        color: 0x020408,
        metalness: 0.5,
        roughness: 0.4,
        clearcoat: 0.3
    });

coronaMaterial = new THREE.ShaderMaterial({
    vertexShader: coronaVS,
    fragmentShader: coronaFS,
    uniforms: {
        color1: { value: new THREE.Color("#8d0c0c") },
        intensity: { value: 0.6 },
        time: { value: 0 }
    },
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
});


    borderMaterial = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8,
        linewidth: 1
    });

    internalBorderMaterial = new THREE.LineBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.9,
        linewidth: 1
    });
}

/* ------------------------------------------------------------
   GLOBE
------------------------------------------------------------ */
function initGlobe() {
    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    countriesGroup = new THREE.Group();
    globeGroup.add(countriesGroup);

    bordersGroup = new THREE.Group();
    globeGroup.add(bordersGroup);

    ocean = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.radius - 0.02, 64, 64),
        oceanMat
    );
    globeGroup.add(ocean);

    atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.radius + 0.8, 64, 64),
        coronaMaterial
    );
    scene.add(atmosphere);
}

/* ------------------------------------------------------------
   ÉVÉNEMENTS
------------------------------------------------------------ */
function initEventListeners() {
    window.addEventListener("mousemove", onMouseMove);
    
    // Raccourci clavier unifié pour les frontières
    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT") return;

        if (e.key.toLowerCase() === "b") {
            showInternalBorders = !showInternalBorders;
            console.log("Internal borders:", showInternalBorders ? "ON" : "OFF");
        }

        if (e.key.toLowerCase() === "s") {
            showSharedOnly = !showSharedOnly;
            console.log("Shared borders only:", showSharedOnly ? "ON" : "OFF");
        }
    });

    window.addEventListener("resize", onWindowResize);
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ------------------------------------------------------------
   UTILITAIRES GÉOMÉTRIE
------------------------------------------------------------ */
function lonLatToVector3(lon, lat, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));
    return new THREE.Vector3(x, y, z);
}

function createPrismExtrusion(ring, R, height) {
    const basePoints = [];
    ring.forEach(([lon, lat]) => basePoints.push(lonLatToVector3(lon, lat, R)));

    const centroid = new THREE.Vector3();
    basePoints.forEach(v => centroid.add(v));
    centroid.divideScalar(basePoints.length);

    const extrudeVector = centroid.clone().normalize().multiplyScalar(height);
    const topPoints = basePoints.map(v => v.clone().add(extrudeVector));

    const data2D = [];
    ring.forEach(([lon, lat]) => data2D.push(lon, lat));
    
    let indices = [];
    if (window.earcut) {
        indices = window.earcut(data2D);
    } else {
        console.error("Earcut is not defined!");
        return new THREE.BufferGeometry();
    }

    const allVertices = [];
    const allIndices = [];
    const n = basePoints.length;
    const offsetBase = 0;
    const offsetTop = n;

    basePoints.forEach(v => allVertices.push(v.x, v.y, v.z));
    topPoints.forEach(v => allVertices.push(v.x, v.y, v.z));

    // base
    indices.forEach(i => allIndices.push(offsetBase + i));
    // top (reverse)
    for (let i = indices.length - 1; i >= 0; i--) {
        allIndices.push(offsetTop + indices[i]);
    }
    // sides
    for (let i = 0; i < n; i++) {
        const i0 = offsetBase + i;
        const i1 = offsetBase + (i + 1) % n;
        const i2 = offsetTop + i;
        const i3 = offsetTop + (i + 1) % n;
        allIndices.push(i0, i2, i1);
        allIndices.push(i1, i2, i3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(allVertices, 3));
    geometry.setIndex(allIndices);
    geometry.computeVertexNormals();
    return geometry;
}

function createSmoothBorder(ring, R, radialOffset, material = borderMaterial) {
    const points = [];
    ring.forEach(([lon, lat]) => {
        const v = lonLatToVector3(lon, lat, R);
        v.normalize().multiplyScalar(R + radialOffset);
        points.push(v);
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.LineLoop(geometry, material.clone());
}

/* ------------------------------------------------------------
   UTILITAIRES FRONTIÈRES
------------------------------------------------------------ */
function normalizeRing(ring, precision = 5) {
    // arrondir pour éviter les micro-écarts
    return ring.map(([lon, lat]) => [
        +lon.toFixed(precision),
        +lat.toFixed(precision)
    ]);
}

function ringToKey(ring) {
    // deux sens possibles (CW / CCW)
    const a = JSON.stringify(ring);
    const b = JSON.stringify([...ring].reverse());
    // clé stable, indépendante du sens
    return a < b ? a : b;
}

function ringAngularExtent(ring) {
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    ring.forEach(([lon, lat]) => {
        // Normalisation [0, 360[ pour gérer correctement l'antiméridien
        let normLon = lon;
        if (normLon < 0) normLon += 360;

        if (normLon < minLon) minLon = normLon;
        if (normLon > maxLon) maxLon = normLon;

        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    });

    return {
        lonSpan: maxLon - minLon,
        latSpan: maxLat - minLat
    };
}

/* ------------------------------------------------------------
   CHARGEMENT GEOJSON
------------------------------------------------------------ */
function loadGeoJSON() {
    fetch(CONFIG.geoJsonUrl)
        .then(res => res.json())
        .then(data => {
            data.features.forEach(feature => {
                const geom = feature.geometry;
                const polys = (geom.type === "Polygon") ? [geom.coordinates] : geom.coordinates;
                const countryName = feature.properties.name || "Unknown";

                polys.forEach(polygon => {
                    polygon.forEach((ring, ringIndex) => {
                        const isOuterRing = ringIndex === 0;
                        addCountryMesh(ring, countryName, isOuterRing);
                    });
                });
            });

            // Marquer les frontières réellement partagées
            // Avec filtre anti-artefact "tour du monde"
            internalBorderIndex.forEach(list => {
                if (list.length >= 2) {
                    const ring = list[0].userData.ring;
                    const span = ringAngularExtent(ring);

                    const isGlobalWrap = span.lonSpan > 300; // Seuil pour filtrer les artefacts

                    if (!isGlobalWrap) {
                        list.forEach(border => {
                            border.userData.shared = true;
                        });
                    }
                }
            });

        })
        .catch(err => console.error("Error loading GeoJSON:", err));
}

function addCountryMesh(ring, countryName, isOuterRing) {
    const geometry = createPrismExtrusion(ring, CONFIG.radius, CONFIG.extrudeDepth);
    const material = baseCountryMaterial.clone();
    const mesh = new THREE.Mesh(geometry, material);

    mesh.userData = {
        name: countryName,
        ring: ring,
        isOuter: isOuterRing
    };

    // Frontière externe
    if (isOuterRing) {
        const borderLine = createSmoothBorder(
            ring,
            CONFIG.radius,
            CONFIG.borderOffset,
            borderMaterial
        );
        borderLine.userData = { kind: "border-external" };
        mesh.add(borderLine);
    }
    // Frontière interne
    else {
        const normRing = normalizeRing(ring);
        const key = ringToKey(normRing);

        const internalBorder = createSmoothBorder(
            ring,
            CONFIG.radius,
            CONFIG.borderOffset * 0.5,
            internalBorderMaterial
        );
        internalBorder.userData = {
            kind: "border-internal",
            country: countryName,
            ring: ring,
            key: key,
            shared: false // par défaut
        };
        bordersGroup.add(internalBorder);

        // indexation
        if (!internalBorderIndex.has(key)) {
            internalBorderIndex.set(key, []);
        }
        internalBorderIndex.get(key).push(internalBorder);
    }

    countriesGroup.add(mesh);
}

/* ------------------------------------------------------------
   ÉTOILES
------------------------------------------------------------ */
function initStars() {
    const starsVS = `
        attribute float size;
        void main() {
            gl_PointSize = size;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
        }
    `;
    const starsFS = `
        uniform vec3 color;
        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            if(length(coord) > 0.5) discard;
            gl_FragColor = vec4(color, 1.0);
        }
    `;

    const starsGeom = new THREE.BufferGeometry();
    const count = 3000;
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const r = 50 + Math.random() * 50;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);

        sizes[i] = 1.0 + Math.random() * 2.0;
    }

    starsGeom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    starsGeom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const starsMat = new THREE.ShaderMaterial({
        vertexShader: starsVS,
        fragmentShader: starsFS,
        uniforms: { color: { value: new THREE.Color(0xffffff) } },
        transparent: true
    });

    scene.add(new THREE.Points(starsGeom, starsMat));
}

/* ------------------------------------------------------------
   HIGHLIGHT FRONTIÈRES
------------------------------------------------------------ */
function highlightInternalBorders(countryName) {
    bordersGroup.children.forEach(line => {
        if (line.userData.country === countryName) {
            line.material.opacity = 1.0;
            line.material.color.set(0xffcc66);
        } else {
            line.material.opacity = 0.15;
            line.material.color.set(0xffaa00);
        }
    });
}

function resetInternalBorders() {
    bordersGroup.children.forEach(line => {
        line.material.opacity = 0.9;
        line.material.color.set(0xffaa00);
    });
}

/* ------------------------------------------------------------
   UTILITAIRES UI
------------------------------------------------------------ */
function bindInput(id, callback, displayId = null) {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("input", (e) => {
        let val = (e.target.type === "checkbox") ? e.target.checked : e.target.value;
        if (e.target.type === "range") val = parseFloat(val);

        callback(val);

        if (displayId) {
            const d = document.getElementById(displayId);
            if (d) d.innerText = e.target.value;
        }
    });
}

function syncDisplay(id, displayId) {
    const el = document.getElementById(id);
    const d = document.getElementById(displayId);
    if (!el || !d) return;
    d.innerText = el.value;
}

function updateMaterial(prop, val) {
    if (baseCountryMaterial[prop] === undefined) return;
    baseCountryMaterial[prop] = val;
    countriesGroup.children.forEach(mesh => {
        if (mesh.material && mesh.material[prop] !== undefined) {
            mesh.material[prop] = val;
        }
    });
}

function clearBordersGroup() {
    bordersGroup.children.forEach(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });
    bordersGroup.clear();
}

function rebuildExtrusion(newHeight) {
    countriesGroup.children.forEach(mesh => {
        if (!(mesh instanceof THREE.Mesh)) return;
        if (!mesh.userData || !mesh.userData.ring) return;

        const newGeo = createPrismExtrusion(mesh.userData.ring, CONFIG.radius, newHeight);
        mesh.geometry.dispose();
        mesh.geometry = newGeo;
    });
}

function rebuildRadius(newRadius) {
    ocean.geometry.dispose();
    ocean.geometry = new THREE.SphereGeometry(newRadius - 0.02, 64, 64);

    atmosphere.geometry.dispose();
    atmosphere.geometry = new THREE.SphereGeometry(newRadius + 0.8, 64, 64);

    clearBordersGroup();

    // Reset de l'index pour garantir la cohérence A+ après rebuild
    internalBorderIndex.clear();

    countriesGroup.children.forEach(mesh => {
        if (!(mesh instanceof THREE.Mesh)) return;
        if (!mesh.userData || !mesh.userData.ring) return;

        const newGeo = createPrismExtrusion(mesh.userData.ring, newRadius, CONFIG.extrudeDepth);
        mesh.geometry.dispose();
        mesh.geometry = newGeo;

        if (mesh.userData.isOuter) {
            const existing = mesh.children.find(ch => ch.userData && ch.userData.kind === "border-external");
            if (existing) {
                existing.geometry.dispose();
                existing.material.dispose();
                mesh.remove(existing);
            }
            const borderLine = createSmoothBorder(mesh.userData.ring, newRadius, CONFIG.borderOffset, borderMaterial);
            borderLine.userData = { kind: "border-external" };
            mesh.add(borderLine);
        } else {
            // Logique de ré-indexation pour les frontières internes
            const normRing = normalizeRing(mesh.userData.ring);
            const key = ringToKey(normRing);

            const internalBorder = createSmoothBorder(
                mesh.userData.ring,
                newRadius,
                CONFIG.borderOffset * 0.5,
                internalBorderMaterial
            );
            internalBorder.userData = {
                kind: "border-internal",
                country: mesh.userData.name,
                ring: mesh.userData.ring,
                key: key,
                shared: false 
            };
            bordersGroup.add(internalBorder);

            // Ajout à l'index
            if (!internalBorderIndex.has(key)) {
                internalBorderIndex.set(key, []);
            }
            internalBorderIndex.get(key).push(internalBorder);
        }
    });

    // Post-rebuild analysis : re-marquage des frontières partagées
    internalBorderIndex.forEach(list => {
        if (list.length >= 2) {
            const ring = list[0].userData.ring;
            const span = ringAngularExtent(ring);
            const isGlobalWrap = span.lonSpan > 300; 

            if (!isGlobalWrap) {
                list.forEach(border => {
                    border.userData.shared = true;
                });
            }
        }
    });
}

/* ------------------------------------------------------------
   BOUCLE D'ANIMATION
------------------------------------------------------------ */
function animate(time) {
    requestAnimationFrame(animate);

    // FPS
    const fpsEl = document.getElementById("fps");
    const dt = time - (window.lastTime || 0);
    window.lastTime = time;
    if (dt > 0 && Math.random() > 0.95) fpsEl.innerText = Math.round(1000 / dt);

    // Raycasting
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(countriesGroup.children, false);

    // Reset hover
    hoveredMeshes.forEach(mesh => {
        if (mesh && mesh.material) {
            mesh.material.emissive.setHex(0x000000);
            mesh.material.emissiveIntensity = 0;
        }
    });
    hoveredMeshes.clear();

    // Gestion du hover
    if (intersects.length > 0) {
        const object = intersects[0].object;

        object.material.emissive.setHex(0x00ffcc);
        object.material.emissiveIntensity = 0.5;
        hoveredMeshes.add(object);

        // Label
        if (object.userData && object.userData.name) {
            labelEl.innerText = object.userData.name;
            labelEl.style.display = "block";
            labelEl.style.borderColor = "#00ffcc";
            labelEl.style.color = "#00ffcc";
            labelEl.style.boxShadow = "0 0 15px rgba(0, 255, 204, 0.5)";

            const point = intersects[0].point.clone();
            point.project(camera);

            const x = (point.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(point.y * 0.5) + 0.5) * window.innerHeight;

            labelEl.style.left = `${x}px`;
            labelEl.style.top = `${y}px`;
        }

        // Highlight des frontières
        if (showInternalBorders) {
            highlightInternalBorders(object.userData.name);
        }

    } else {
        labelEl.style.display = "none";
        resetInternalBorders();
    }

    // Animation
    const t = time * 0.001;
    coronaMaterial.uniforms.time.value = t;

    controls.update();

    if (CONFIG.autoRotate) {
        globeGroup.rotation.y += CONFIG.rotateSpeed;
    }

    // Visibilité des frontières
    bordersGroup.children.forEach(line => {
        if (!showInternalBorders) {
            line.visible = false;
        } else if (showSharedOnly) {
            line.visible = line.userData.shared === true;
        } else {
            line.visible = true;
        }
    });

    renderer.render(scene, camera);
}

/* ------------------------------------------------------------
   DÉMARRAGE
------------------------------------------------------------ */
// Initialiser quand la page est chargée
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}