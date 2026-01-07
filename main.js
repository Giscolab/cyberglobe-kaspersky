        import * as THREE from "https://esm.sh/three";
        import { OrbitControls } from "https://esm.sh/three/addons/controls/OrbitControls.js";
        import earcut from "https://esm.sh/earcut";
        window.earcut = earcut; 

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
            borderOffset: 0.1,
            segments: 64
        };

        /* ------------------------------------------------------------
           VARIABLES GLOBALES
        ------------------------------------------------------------ */
        let showInternalBorders = true;
        let showSharedOnly = false;
        let scene, camera, renderer, controls;
        let raycaster, mouse, hoveredMeshes, labelEl;
        let globeGroup, countriesGroup, bordersGroup;
        let ocean, atmosphere, stars;
        let baseCountryMaterial, oceanMat, coronaMaterial, borderMaterial, internalBorderMaterial;
        let sunLight, rimLight, ambientLight, blueLight;
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
           UI & PRESETS
        ------------------------------------------------------------ */
        function initUI() {
            // Sync display
            const idsToSync = [
                "geo-extrude", "geo-radius", "geo-atmo-rad", 
                "glass-trans", "glass-rough", "glass-metal", "glass-clear",
                "ocean-metal", "ocean-rough", "ocean-clear",
                "corona-int", "light-sun-int", "light-amb-int", "light-rim-int",
                "env-fog", "env-rot", "cam-fov", "star-size", "light-sun-x", "light-sun-y"
            ];
            idsToSync.forEach(id => syncDisplay(id, `val-${id}`));
            
            // Initial Scale
            const atmoInput = document.getElementById("geo-atmo-rad");
            if (atmoInput) {
                const val = parseFloat(atmoInput.value);
                atmosphere.scale.set(1 + (val / 0.8), 1 + (val / 0.8), 1 + (val / 0.8));
            }

            // --- BINDING BASIQUE ---

            // Géométrie
            bindInput("geo-extrude", (val) => { CONFIG.extrudeDepth = val; rebuildExtrusion(val); }, "val-geo-extrude");
            bindInput("geo-radius", (val) => { CONFIG.radius = val; rebuildRadius(val); }, "val-geo-radius");
            bindInput("geo-seg", (val) => { CONFIG.segments = parseInt(val); rebuildAllGeometries(); }, "val-geo-seg");
            
            bindInput("geo-atmo-rad", (val) => {
                const s = 1 + (val / 0.8);
                atmosphere.scale.set(s, s, s);
            }, "val-geo-atmo-rad");

            // Pays
            bindInput("glass-col", (v) => updateCountryProp("color", new THREE.Color(v)));
            bindInput("glass-trans", (v) => updateCountryProp("transmission", v), "val-glass-trans");
            bindInput("glass-rough", (v) => updateCountryProp("roughness", v), "val-glass-rough");
            bindInput("glass-metal", (v) => updateCountryProp("metalness", v), "val-glass-metal");
            bindInput("glass-clear", (v) => updateCountryProp("clearcoat", v), "val-glass-clear");

            // Océan
            bindInput("ocean-col", (v) => oceanMat.color.set(v));
            bindInput("ocean-metal", (v) => oceanMat.metalness = v, "val-ocean-metal");
            bindInput("ocean-rough", (v) => oceanMat.roughness = v, "val-ocean-rough");
            bindInput("ocean-clear", (v) => oceanMat.clearcoat = v, "val-ocean-clear");

            // Effets
            bindInput("corona-int", (v) => coronaMaterial.uniforms.intensity.value = parseFloat(v), "val-corona-int");
            bindInput("corona-col1", (v) => coronaMaterial.uniforms.color1.value = new THREE.Color(v));
            
            bindInput("star-col", (v) => stars.material.uniforms.color.value = new THREE.Color(v));
            bindInput("star-size", (v) => {
                // Reconstruire les étoiles pour changer la taille (attribute)
                if(stars) {
                    scene.remove(stars);
                    stars.geometry.dispose();
                    initStars();
                }
            }, "val-star-size");

            // Lumière
            bindInput("light-sun-int", (v) => sunLight.intensity = parseFloat(v), "val-light-sun-int");
            bindInput("light-sun-col", (v) => sunLight.color.set(v));
            bindInput("light-sun-x", (v) => sunLight.position.x = parseFloat(v), "val-light-sun-x");
            bindInput("light-sun-y", (v) => sunLight.position.y = parseFloat(v), "val-light-sun-y");
            bindInput("light-rim-int", (v) => rimLight.intensity = parseFloat(v), "val-light-rim-int");
            bindInput("light-amb-int", (v) => ambientLight.intensity = parseFloat(v), "val-light-amb-int");

            // Env
            bindInput("env-bg-col", (v) => {
                const c = new THREE.Color(v);
                scene.background = c;
                scene.fog.color = c;
            });
            bindInput("env-fog", (v) => scene.fog.density = parseFloat(v), "val-env-fog");
            bindInput("env-rot", (v) => CONFIG.rotateSpeed = parseFloat(v), "val-env-rot");
            bindInput("cam-fov", (v) => {
                camera.fov = parseFloat(v);
                camera.updateProjectionMatrix();
            }, "val-cam-fov");

            // --- PRESETS (LISTES DÉROULANTES) ---

            // 1. Preset Pays
            document.getElementById("preset-country").addEventListener("change", (e) => {
                const val = e.target.value;
                if(val === 'cyber') {
                    setInputVal("glass-col", "#00ffcc");
                    setInputVal("glass-trans", "0.0");
                    setInputVal("glass-metal", "0.0");
                    setInputVal("glass-rough", "0.0");
                    setInputVal("glass-clear", "1.0");
                } else if (val === 'holo') {
                    setInputVal("glass-col", "#88ffff");
                    setInputVal("glass-trans", "0.8");
                    setInputVal("glass-metal", "0.9");
                    setInputVal("glass-rough", "0.1");
                    setInputVal("glass-clear", "0.1");
                } else if (val === 'matte') {
                    setInputVal("glass-col", "#00aa88");
                    setInputVal("glass-trans", "0.0");
                    setInputVal("glass-metal", "0.0");
                    setInputVal("glass-rough", "0.8");
                    setInputVal("glass-clear", "0.0");
                } else if (val === 'metal') {
                    setInputVal("glass-col", "#aaaaaa");
                    setInputVal("glass-trans", "0.0");
                    setInputVal("glass-metal", "1.0");
                    setInputVal("glass-rough", "0.2");
                    setInputVal("glass-clear", "1.0");
                } else if (val === 'neon') {
                    setInputVal("glass-col", "#ff00ff");
                    setInputVal("glass-trans", "0.0");
                    setInputVal("glass-metal", "0.0");
                    setInputVal("glass-rough", "0.0");
                    setInputVal("glass-clear", "1.0");
                }
            });

            // 2. Preset Océan
            document.getElementById("preset-ocean").addEventListener("change", (e) => {
                const val = e.target.value;
                if(val === 'deep') {
                    setInputVal("ocean-col", "#020408");
                    setInputVal("ocean-metal", "0.5");
                    setInputVal("ocean-rough", "0.4");
                    setInputVal("ocean-clear", "0.3");
                } else if (val === 'cyan') {
                    setInputVal("ocean-col", "#001133");
                    setInputVal("ocean-metal", "0.8");
                    setInputVal("ocean-rough", "0.1");
                    setInputVal("ocean-clear", "0.8");
                } else if (val === 'obsidian') {
                    setInputVal("ocean-col", "#000000");
                    setInputVal("ocean-metal", "0.9");
                    setInputVal("ocean-rough", "0.0");
                    setInputVal("ocean-clear", "1.0");
                } else if (val === 'liquid') {
                    setInputVal("ocean-col", "#444444");
                    setInputVal("ocean-metal", "1.0");
                    setInputVal("ocean-rough", "0.2");
                    setInputVal("ocean-clear", "0.5");
                }
            });

            // 3. Preset Lumière
            document.getElementById("preset-light").addEventListener("change", (e) => {
                const val = e.target.value;
                if(val === 'default') {
                    setInputVal("light-sun-col", "#831f84");
                    setInputVal("light-sun-int", "3.0");
                    setInputVal("light-amb-int", "1.0");
                    setInputVal("env-bg-col", "#000000");
                    setInputVal("corona-col1", "#8d0c0c");
                } else if (val === 'sunset') {
                    setInputVal("light-sun-col", "#ffaa00");
                    setInputVal("light-sun-int", "4.0");
                    setInputVal("light-amb-int", "0.5");
                    setInputVal("env-bg-col", "#1a0500");
                    setInputVal("corona-col1", "#ff4400");
                } else if (val === 'night') {
                    setInputVal("light-sun-col", "#eeeeff");
                    setInputVal("light-sun-int", "1.5");
                    setInputVal("light-amb-int", "0.2");
                    setInputVal("env-bg-col", "#000510");
                    setInputVal("corona-col1", "#ffffff");
                } else if (val === 'cyberpunk') {
                    setInputVal("light-sun-col", "#ff00cc");
                    setInputVal("light-sun-int", "3.0");
                    setInputVal("light-amb-int", "1.0");
                    setInputVal("env-bg-col", "#0a0010");
                    setInputVal("corona-col1", "#00ffff");
                }
            });
        }

        // Helper pour presets : met à jour l'input ET déclenche l'événement
        function setInputVal(id, val) {
            const el = document.getElementById(id);
            if(el) {
                el.value = val;
                el.dispatchEvent(new Event('input'));
            }
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

            blueLight = new THREE.DirectionalLight(0x0088ff, 0.5);
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
    // --- 1. MATERIAU PAYS ---
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

    // --- 2. SHADER CORONA (CORRIGÉ) ---
    const coronaVS = `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
            vUv = uv;
            // On ne redéclare pas 'position' ou 'normal', Three.js le fait
            vNormal = normalize(normalMatrix * normal);
            
            // Calcul de la position vue pour le Fresnel correct
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz; // Vecteur pointant vers la caméra
            
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    const coronaFS = `
        precision mediump float;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        uniform vec3 color1;
        uniform vec3 color2;
        uniform float intensity;
        uniform float time;

        // --- FONCTIONS DE BRUIT (Standard GLSL) ---
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            vec2 shift = vec2(100.0);
            // Matrice de rotation 2D explicite
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5)); 
            
            for (int i = 0; i < 5; ++i) {
                v += a * noise(p);
                p = rot * p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            // 1. Calcul de l'angle de vue (Fresnel)
            vec3 viewDir = normalize(vViewPosition);
            
            // vNormal est en View Space ici grâce à normalMatrix
            float viewAngle = dot(vNormal, viewDir);
            
            // Création de la forme du halo (bord de la sphère)
            // On prend l'absolu car on est en BackSide
            float glowShape = pow(1.0 - abs(viewAngle), 2.5);

            // 2. Simulation de la Fumée (Smoke) - Animation
            vec2 smokeUV1 = vUv * 5.0 + vec2(0.01 * time, 0.0); 
            float smoke1 = fbm(smokeUV1);

            vec2 smokeUV2 = vUv * 3.0 - vec2(0.007 * time, 0.0); 
            float smoke2 = fbm(smokeUV2);

            float totalSmoke = smoke1 * (1.5 * smoke2);

            // 3. Dégradé vertical
            float verticalGradient = pow(vUv.y, 0.25); 
            vec3 baseColor = mix(color2, color1, verticalGradient);

            // 4. Assemblage final
            vec3 finalColor = baseColor + (0.3 * totalSmoke);
            
            float alpha = glowShape * intensity;

            gl_FragColor = vec4(finalColor, alpha);
        }
    `;

    coronaMaterial = new THREE.ShaderMaterial({
        vertexShader: coronaVS,
        fragmentShader: coronaFS,
        uniforms: {
            color1: { value: new THREE.Color("#8d0c0c") },
            color2: { value: new THREE.Color("#000000") },
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
                new THREE.SphereGeometry(CONFIG.radius - 0.02, CONFIG.segments, CONFIG.segments),
                oceanMat
            );
            globeGroup.add(ocean);

            atmosphere = new THREE.Mesh(
                new THREE.SphereGeometry(CONFIG.radius + 0.8, CONFIG.segments, CONFIG.segments),
                coronaMaterial
            );
            scene.add(atmosphere);

            initStars();
        }

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
            const baseSize = parseFloat(document.getElementById("star-size")?.value || 1.0);

            for (let i = 0; i < count; i++) {
                const r = 50 + Math.random() * 50;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
                pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
                pos[i * 3 + 2] = r * Math.cos(phi);
                sizes[i] = baseSize + Math.random() * baseSize;
            }

            starsGeom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
            starsGeom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

            const starsMat = new THREE.ShaderMaterial({
                vertexShader: starsVS,
                fragmentShader: starsFS,
                uniforms: { color: { value: new THREE.Color(0xffffff) } },
                transparent: true
            });

            stars = new THREE.Points(starsGeom, starsMat);
            scene.add(stars);
        }

        /* ------------------------------------------------------------
           ÉVÉNEMENTS
        ------------------------------------------------------------ */
        function initEventListeners() {
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("keydown", (e) => {
                if (e.target.tagName === "INPUT") return;
                if (e.key.toLowerCase() === "b") showInternalBorders = !showInternalBorders;
                if (e.key.toLowerCase() === "s") showSharedOnly = !showSharedOnly;
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

        function createSphericalExtrusion(ring, R, height) {
            const R2 = R + height;
            const vertices = [];
            const indices = [];
            const basePts = ring.map(([lon, lat]) => lonLatToVector3(lon, lat, R));
            const topPts  = ring.map(([lon, lat]) => lonLatToVector3(lon, lat, R2));

            basePts.forEach(v => vertices.push(v.x, v.y, v.z));
            topPts .forEach(v => vertices.push(v.x, v.y, v.z));

            const n = ring.length;
            const offsetBase = 0;
            const offsetTop  = n;

            const pts2D = [];
            ring.forEach(([lon, lat]) => pts2D.push(lon, lat));
            if (!window.earcut) return new THREE.BufferGeometry();
            
            const flat = window.earcut(pts2D);
            flat.forEach(i => indices.push(offsetBase + i));
            for (let i = flat.length - 1; i >= 0; i--) indices.push(offsetTop + flat[i]);

            for (let i = 0; i < n; i++) {
                const next = (i + 1) % n;
                const i0 = offsetBase + i;
                const i1 = offsetBase + next;
                const i2 = offsetTop  + i;
                const i3 = offsetTop  + next;
                indices.push(i0, i2, i1);
                indices.push(i1, i2, i3);
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setIndex(indices);
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
                    internalBorderIndex.forEach(list => {
                        if (list.length >= 2) {
                            const ring = list[0].userData.ring;
                            const span = ringAngularExtent(ring);
                            const isGlobalWrap = span.lonSpan > 300; 
                            if (!isGlobalWrap) list.forEach(border => border.userData.shared = true);
                        }
                    });
                })
                .catch(err => console.error("Error loading GeoJSON:", err));
        }

        function addCountryMesh(ring, countryName, isOuterRing) {
            const geometry = createSphericalExtrusion(ring, CONFIG.radius, CONFIG.extrudeDepth);
            const material = baseCountryMaterial.clone();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData = { name: countryName, ring: ring, isOuter: isOuterRing };

            if (isOuterRing) {
                const borderLine = createSmoothBorder(ring, CONFIG.radius, CONFIG.borderOffset, borderMaterial);
                borderLine.userData = { kind: "border-external" };
                mesh.add(borderLine);
            } else {
                const normRing = normalizeRing(ring);
                const key = ringToKey(normRing);
                const internalBorder = createSmoothBorder(ring, CONFIG.radius, CONFIG.borderOffset * 0.5, internalBorderMaterial);
                internalBorder.userData = { kind: "border-internal", country: countryName, ring: ring, key: key, shared: false };
                bordersGroup.add(internalBorder);
                if (!internalBorderIndex.has(key)) internalBorderIndex.set(key, []);
                internalBorderIndex.get(key).push(internalBorder);
            }
            countriesGroup.add(mesh);
        }

        /* ------------------------------------------------------------
           UTILITAIRES
        ------------------------------------------------------------ */
        function normalizeRing(ring, precision = 5) {
            return ring.map(([lon, lat]) => [+lon.toFixed(precision), +lat.toFixed(precision)]);
        }
        function ringToKey(ring) {
            const a = JSON.stringify(ring);
            const b = JSON.stringify([...ring].reverse());
            return a < b ? a : b;
        }
        function ringAngularExtent(ring) {
            let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
            ring.forEach(([lon, lat]) => {
                let normLon = lon; if (normLon < 0) normLon += 360;
                if (normLon < minLon) minLon = normLon; if (normLon > maxLon) maxLon = normLon;
                if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
            });
            return { lonSpan: maxLon - minLon, latSpan: maxLat - minLat };
        }
        function bindInput(id, callback, displayId = null) {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener("input", (e) => {
                let val = (e.target.type === "checkbox") ? e.target.checked : e.target.value;
                if (e.target.type === "range" || e.target.tagName === "SELECT") val = parseFloat(val);
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
        function updateCountryProp(prop, val) {
            baseCountryMaterial[prop] = val;
            countriesGroup.children.forEach(mesh => {
                if (mesh.material && mesh.material[prop] !== undefined) mesh.material[prop] = val;
            });
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
           REBUILD LOGIC
        ------------------------------------------------------------ */
        function rebuildAllGeometries() {
            // Rebuild Ocean, Atmosphere, Countries with new segment count
            ocean.geometry.dispose();
            ocean.geometry = new THREE.SphereGeometry(CONFIG.radius - 0.02, CONFIG.segments, CONFIG.segments);

            atmosphere.geometry.dispose();
            atmosphere.geometry = new THREE.SphereGeometry(CONFIG.radius + 0.8, CONFIG.segments, CONFIG.segments);
            
            rebuildExtrusion(CONFIG.extrudeDepth);
        }

        function rebuildExtrusion(newHeight) {
            countriesGroup.children.forEach(mesh => {
                if (!(mesh instanceof THREE.Mesh)) return;
                if (!mesh.userData || !mesh.userData.ring) return;
                const newGeo = createSphericalExtrusion(mesh.userData.ring, CONFIG.radius, newHeight);
                mesh.geometry.dispose();
                mesh.geometry = newGeo;
            });
        }

        function rebuildRadius(newRadius) {
            CONFIG.radius = newRadius;
            ocean.geometry.dispose();
            ocean.geometry = new THREE.SphereGeometry(newRadius - 0.02, CONFIG.segments, CONFIG.segments);
            atmosphere.geometry.dispose();
            atmosphere.geometry = new THREE.SphereGeometry(newRadius + 0.8, CONFIG.segments, CONFIG.segments);

            clearBordersGroup();
            internalBorderIndex.clear();

            countriesGroup.children.forEach(mesh => {
                if (!(mesh instanceof THREE.Mesh)) return;
                if (!mesh.userData || !mesh.userData.ring) return;

                const newGeo = createSphericalExtrusion(mesh.userData.ring, newRadius, CONFIG.extrudeDepth);
                mesh.geometry.dispose();
                mesh.geometry = newGeo;

                if (mesh.userData.isOuter) {
                    const existing = mesh.children.find(ch => ch.userData && ch.userData.kind === "border-external");
                    if (existing) { existing.geometry.dispose(); existing.material.dispose(); mesh.remove(existing); }
                    const borderLine = createSmoothBorder(mesh.userData.ring, newRadius, CONFIG.borderOffset, borderMaterial);
                    borderLine.userData = { kind: "border-external" };
                    mesh.add(borderLine);
                } else {
                    const normRing = normalizeRing(mesh.userData.ring);
                    const key = ringToKey(normRing);
                    const internalBorder = createSmoothBorder(mesh.userData.ring, newRadius, CONFIG.borderOffset * 0.5, internalBorderMaterial);
                    internalBorder.userData = { kind: "border-internal", country: mesh.userData.name, ring: mesh.userData.ring, key: key, shared: false };
                    bordersGroup.add(internalBorder);
                    if (!internalBorderIndex.has(key)) internalBorderIndex.set(key, []);
                    internalBorderIndex.get(key).push(internalBorder);
                }
            });
            internalBorderIndex.forEach(list => {
                if (list.length >= 2) {
                    const ring = list[0].userData.ring;
                    const span = ringAngularExtent(ring);
                    if (span.lonSpan <= 300) list.forEach(border => border.userData.shared = true);
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

        /* ------------------------------------------------------------
           ANIMATION
        ------------------------------------------------------------ */
        function animate(time) {
            requestAnimationFrame(animate);
            const fpsEl = document.getElementById("fps");
            const dt = time - (window.lastTime || 0);
            window.lastTime = time;
            if (dt > 0 && Math.random() > 0.95) fpsEl.innerText = Math.round(1000 / dt);

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(countriesGroup.children, false);

            hoveredMeshes.forEach(mesh => {
                if (mesh && mesh.material) {
                    mesh.material.emissive.setHex(0x000000);
                    mesh.material.emissiveIntensity = 0;
                }
            });
            hoveredMeshes.clear();

            if (intersects.length > 0) {
                const object = intersects[0].object;
                object.material.emissive.setHex(0x00ffcc);
                object.material.emissiveIntensity = 0.5;
                hoveredMeshes.add(object);

                if (object.userData && object.userData.name) {
                    labelEl.innerText = object.userData.name;
                    labelEl.style.display = "block";
                    const point = intersects[0].point.clone();
                    point.project(camera);
                    labelEl.style.left = `${(point.x * 0.5 + 0.5) * window.innerWidth}px`;
                    labelEl.style.top = `${(-(point.y * 0.5) + 0.5) * window.innerHeight}px`;
                }
                if (showInternalBorders) highlightInternalBorders(object.userData.name);
            } else {
                labelEl.style.display = "none";
                resetInternalBorders();
            }

            coronaMaterial.uniforms.time.value = time * 0.001;
            controls.update();

            if (CONFIG.autoRotate) globeGroup.rotation.y += CONFIG.rotateSpeed;

            bordersGroup.children.forEach(line => {
                if (!showInternalBorders) line.visible = false;
                else if (showSharedOnly) line.visible = line.userData.shared === true;
                else line.visible = true;
            });

            renderer.render(scene, camera);
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();