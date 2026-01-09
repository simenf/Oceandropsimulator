class OceanSimulation {
    constructor(config) {
        this.totalDays = config.totalDays || 1825;
        this.currentDay = 0;
        this.delay = 50; // ms
        this.isRunning = false;
        this.drops = [];
        this.stats = {
            land: 0,
            water: 0,
            avgTemp: 0,
            totalAttempts: 0,  // Track total random point attempts
            landAttempts: 0   // Track how many hit land
        };

        // Callbacks
        this.onTick = config.onTick || (() => { });
        this.onFinish = config.onFinish || (() => { });
        this.onCheckLand = config.onCheckLand || (() => false); // External dependency
    }

    start() {
        if (!this.isRunning && this.currentDay < this.totalDays) {
            this.isRunning = true;
            this.loop();
        }
    }

    pause() {
        this.isRunning = false;
    }

    reset() {
        this.isRunning = false;
        this.currentDay = 0;
        this.drops = [];
        this.stats = { land: 0, coastal: 0, water: 0, avgTemp: 0, totalAttempts: 0, landAttempts: 0 };
        this.onTick(null, this.stats);
    }

    setSpeed(speedVal) {
        // speedVal 1-100.
        // 1 = slow (200ms), 100 = fast (1ms)
        this.delay = 200 - ((speedVal / 100) * 199);
    }

    loop() {
        if (!this.isRunning) return;

        if (this.currentDay >= this.totalDays) {
            this.isRunning = false;
            this.onFinish();
            return;
        }

        this.simulateDay();

        setTimeout(() => this.loop(), this.delay);
    }

    simulateDay() {
        let drop = null;
        let attempts = 0;

        // Retry loop (max attempts to prevent infinite freeze if map is broken)
        while (attempts < 100) {
            attempts++;

            // Spherical Sampling
            const u = Math.random();
            const v = Math.random();

            const latRad = Math.asin(2 * u - 1);
            const lonRad = 2 * Math.PI * v;

            const lat = latRad * (180 / Math.PI);
            const lon = (lonRad * (180 / Math.PI)) - 180;

            // Check location type - now returns { type, distanceKm }
            const terrainInfo = this.onCheckLand(lon, lat);
            const locationType = typeof terrainInfo === 'object' ? terrainInfo.type : terrainInfo;
            const distanceKm = typeof terrainInfo === 'object' ? terrainInfo.distanceKm : null;

            // Track attempts
            this.stats.totalAttempts++;

            if (locationType === 'LAND') {
                // Track land hit and retry
                this.stats.landAttempts++;
                continue;
            }

            // If we are here, it's WATER or COASTAL
            this.currentDay++; // Only increment day on success

            const temp = this.calculateTemperature(lat);

            drop = {
                day: this.currentDay,
                lon,
                lat,
                locationType,
                distanceKm, // Store distance for display
                temp
            };

            break;
        }

        if (!drop) {
            console.warn("Could not find water point after 100 attempts!");
            return;
        }

        this.drops.push(drop);

        // Update stats
        this.stats.water++;
        if (drop.locationType === 'COASTAL') this.stats.coastal++;

        // Running average for temp
        this.stats.avgTemp += (drop.temp - this.stats.avgTemp) / this.currentDay;

        this.onTick(drop, this.stats);
    }

    calculateTemperature(lat) {
        // Simple model: 
        // Equator (0) = ~30C
        // Poles (90) = ~-2C
        // Cosine approximation
        const absLat = Math.abs(lat);
        // temp = 30 * cos(lat) - 2 * sin(lat)? No, checking simple graph
        // Let's use: T = 30 - 32 * (lat/90)^2 (Simple quadratic dropoff)
        // Or cleaner: T = -2 + 32 * cos(latRad)
        const latRad = lat * (Math.PI / 180);
        return -2 + (32 * Math.cos(latRad));
    }
}

// Map Settings
const width = 800;
const height = 400;

// Setup D3 Projection
const projection = d3.geoEquirectangular()
    .scale(130)
    .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

const svg = d3.select("#map-container")
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

// Container for zoomable content
const gZoom = svg.append("g").attr("class", "zoom-container");

// Ocean background (drawn first, behind land)
gZoom.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#3d5a3d"); // Background is land (green) because path is ocean

// Layers inside zoom container
const gMap = gZoom.append("g").attr("class", "map-layer");
const gDrops = gZoom.append("g").attr("class", "drop-layer");

// Add zoom behavior with smart panning
const zoom = d3.zoom()
    .scaleExtent([1, 20])
    .translateExtent([[0, 0], [width, height]]) // Constrain pan to map bounds
    .filter((event) => {
        // Allow wheel events (zoom) always
        if (event.type === 'wheel') return true;
        // Only allow drag (pan) when zoomed in
        const currentTransform = d3.zoomTransform(svg.node());
        return currentTransform.k > 1;
    })
    .on("zoom", (event) => {
        gZoom.attr("transform", event.transform);
    });

svg.call(zoom);

// Offscreen Canvas for detection
const hitCanvas = document.createElement('canvas');
hitCanvas.width = width;
hitCanvas.height = height;
const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });

// Simulation Instance
let sim = null;
let landFeatures = null;

// UI Elements
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');
const speedSlider = document.getElementById('speed-slider');
const elDay = document.getElementById('day-count');
const elStatus = document.getElementById('status-indicator');
const elLand = document.getElementById('land-count'); // Now used for Coastal
const elTemp = document.getElementById('avg-temp');
const elLog = document.getElementById('event-log');

// Update labels
document.querySelector('#stats-panel .stat-card:nth-child(3) h3').textContent = "Coastal Hits";

// Open Google Maps satellite view for a location with marker
function openGoogleMaps(lat, lon) {
    // Zoom 8 = regional view, place adds a marker
    const url = `https://www.google.com/maps/place/${lat},${lon}/@${lat},${lon},8z/data=!3m1!1e3`;
    window.open(url, '_blank');
}

let hitData = null; // Store Uint8ClampedArray

async function init() {
    elStatus.textContent = "Loading Map Data...";
    console.log("Starting initialization...");

    try {
        let hasPolygons = false;

        // Try precomputed polygons first (for fast land detection)
        try {
            console.log("Loading precomputed polygons...");
            const response = await fetch('./data/land-precomputed.json');
            if (response.ok) {
                const precomputed = await response.json();
                landPolygons = precomputed.landPolygons;
                // Derive coastlineCoords from polygons
                coastlineCoords = [];
                landPolygons.forEach(ring => {
                    ring.forEach(coord => coastlineCoords.push(coord));
                });
                hasPolygons = true;
                console.log("Loaded precomputed:", coastlineCoords.length, "points,", landPolygons.length, "polygons");
            }
        } catch (e) {
            console.log("Precomputed data not available");
        }

        // Load TopoJSON for map rendering
        elStatus.textContent = "Loading map...";
        const response = await fetch('./data/land-10m.json');
        if (!response.ok) throw new Error("Failed to load map data");
        const world = await response.json();
        console.log("Map data loaded");

        elStatus.textContent = "Processing map...";
        await new Promise(resolve => setTimeout(resolve, 10));
        landFeatures = topojson.feature(world, world.objects.land);
        console.log("TopoJSON converted");

        // Extract coastlines if no precomputed data
        if (!hasPolygons) {
            elStatus.textContent = "Extracting coastlines...";
            await new Promise(resolve => setTimeout(resolve, 10));
            extractCoastlineCoords();
        }

        // Render Visible Map
        elStatus.textContent = "Rendering map...";
        await new Promise(resolve => setTimeout(resolve, 10));

        gMap.append("path")
            .datum(landFeatures)
            .attr("class", "land-path")
            .attr("d", path);
        console.log("Map rendered");

        elStatus.textContent = "Ready";
        console.log("Initialization complete");
        setupSimulation();

    } catch (err) {
        console.error(err);
        elStatus.textContent = "Error Loading Map";
    }
}

// --- Geodesic Distance Functions ---

// Haversine distance between two points in km
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Minimum distance from point to line segment (in km)
function pointToSegmentDistance(pLat, pLon, aLat, aLon, bLat, bLon) {
    const segLen = haversineDistance(aLat, aLon, bLat, bLon);
    if (segLen < 0.001) return haversineDistance(pLat, pLon, aLat, aLon);

    // Project point onto line (approximation for short segments)
    const t = Math.max(0, Math.min(1, (
        (pLat - aLat) * (bLat - aLat) + (pLon - aLon) * (bLon - aLon)
    ) / (segLen * segLen * 0.0001))); // Rough scaling

    const projLat = aLat + t * (bLat - aLat);
    const projLon = aLon + t * (bLon - aLon);
    return haversineDistance(pLat, pLon, projLat, projLon);
}

// Get minimum distance to any coastline segment (sampled for performance)
let coastlineCoords = null;
function getDistanceToCoast(lat, lon) {
    if (!coastlineCoords) return Infinity;

    let minDist = Infinity;
    // Sample every Nth point for performance
    const step = 10;
    for (let i = 0; i < coastlineCoords.length - 1; i += step) {
        const [aLon, aLat] = coastlineCoords[i];
        const [bLon, bLat] = coastlineCoords[Math.min(i + step, coastlineCoords.length - 1)];
        const dist = pointToSegmentDistance(lat, lon, aLat, aLon, bLat, bLon);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

// Store land polygons for point-in-polygon test
let landPolygons = [];

// Ray-casting algorithm for point-in-polygon
function isPointInPolygon(lon, lat, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];

        if (((yi > lat) !== (yj > lat)) &&
            (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// Check if point is on land using polygon test (more accurate than pixels)
function isOnLandPolygon(lon, lat) {
    // Fix for Antarctica: Ray-casting often fails at the poles due to date-line wrapping
    if (lat < -80) return true;

    for (const polygon of landPolygons) {
        if (isPointInPolygon(lon, lat, polygon)) {
            return true;
        }
    }
    return false;
}

// Extract coastline coordinates AND polygons from landFeatures
function extractCoastlineCoords() {
    if (!landFeatures) {
        console.error("No landFeatures available");
        return;
    }
    coastlineCoords = [];
    landPolygons = [];

    const processRing = (ring) => {
        if (!ring || !Array.isArray(ring)) return;
        if (ring.length > 0 && typeof ring[0][0] === 'number') {
            // This is a valid ring of [lon, lat] pairs
            landPolygons.push(ring);
            ring.forEach(coord => coastlineCoords.push(coord));
        }
    };

    const processCoords = (coords, type) => {
        if (!coords) return;

        if (type === 'Polygon') {
            // Polygon: array of rings, first is exterior
            coords.forEach(ring => processRing(ring));
        } else if (type === 'MultiPolygon') {
            // MultiPolygon: array of polygons
            coords.forEach(polygon => {
                polygon.forEach(ring => processRing(ring));
            });
        } else {
            // Unknown structure, try to detect
            if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                processRing(coords);
            } else if (Array.isArray(coords[0])) {
                coords.forEach(c => processCoords(c));
            }
        }
    };

    // Handle different GeoJSON structures
    if (landFeatures.features) {
        landFeatures.features.forEach(f => {
            if (f.geometry) {
                processCoords(f.geometry.coordinates, f.geometry.type);
            }
        });
    } else if (landFeatures.geometry) {
        processCoords(landFeatures.geometry.coordinates, landFeatures.geometry.type);
    } else if (landFeatures.geometries) {
        landFeatures.geometries.forEach(g => {
            processCoords(g.coordinates, g.type);
        });
    } else if (landFeatures.type === 'Polygon' || landFeatures.type === 'MultiPolygon') {
        processCoords(landFeatures.coordinates, landFeatures.type);
    }

    console.log(`Extracted ${coastlineCoords.length} coastline points, ${landPolygons.length} polygons`);
    if (landPolygons.length === 0) {
        console.warn("No land polygons extracted! Structure:", landFeatures);
    }
}

// --- Zone Thresholds (km) ---
const ZONE_COASTAL_KM = 1;     // 1000m (1km)
const ZONE_SHELF_KM = 100;     // 100km
const ZONE_FAR_KM = 300;       // 300km

function isOnLandPixel(lon, lat) {
    if (!hitData) return false;
    const coords = projection([lon, lat]);
    if (!coords) return false;
    const x = Math.floor(coords[0]);
    const y = Math.floor(coords[1]);
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const index = (y * width + x) * 4;
    return hitData[index + 2] > 100; // Blue > 100 means land
}

// Returns { type: string, distanceKm: number }
function getTerrainTypeWithDistance(lon, lat) {
    // Calculate distance to coastline
    const distKm = getDistanceToCoast(lat, lon);

    // PRIMARY: Polygon-based land check (accurate geometric test)
    if (isOnLandPolygon(lon, lat)) {
        return { type: 'LAND', distanceKm: 0 };
    }

    // SECONDARY: Distance-based zone classification (for ocean points only)
    if (distKm <= ZONE_COASTAL_KM) return { type: 'COASTAL', distanceKm: distKm };
    if (distKm <= ZONE_SHELF_KM) return { type: 'SHELF', distanceKm: distKm };
    if (distKm <= ZONE_FAR_KM) return { type: 'FAR', distanceKm: distKm };
    return { type: 'DEEP_OCEAN', distanceKm: distKm };
}

// Backwards compatible wrapper
function getTerrainType(lon, lat) {
    return getTerrainTypeWithDistance(lon, lat).type;
}

function setupSimulation() {
    sim = new OceanSimulation({
        totalDays: 1825,
        onCheckLand: (lon, lat) => {
            // Return full info for distance tracking
            return getTerrainTypeWithDistance(lon, lat);
        },
        onTick: (drop, stats) => {
            updateUI(drop, stats);
        },
        onFinish: () => {
            elStatus.textContent = "Finished 5 Years";
            btnStart.disabled = false;
            btnPause.disabled = true;
            updateCharts(sim.drops); // Final update
        }
    });

    btnStart.addEventListener('click', () => {
        sim.start();
        elStatus.textContent = "Running";
        btnStart.disabled = true;
        btnPause.disabled = false;
    });

    btnPause.addEventListener('click', () => {
        sim.pause();
        elStatus.textContent = "Paused";
        btnStart.disabled = false;
        btnPause.disabled = true;
    });

    btnReset.addEventListener('click', () => {
        sim.reset();
        gDrops.selectAll("*").remove();
        elLog.innerHTML = "";
        elStatus.textContent = "Ready";
        btnStart.disabled = false;
        btnPause.disabled = true;
        updateStats({ land: 0, coastal: 0, water: 0, avgTemp: 0 });
        elDay.textContent = "0 / 1825";
        updateCharts([]);
    });

    speedSlider.addEventListener('input', (e) => {
        sim.setSpeed(e.target.value);
    });
}

function updateStats(stats) {
    elTemp.textContent = stats.avgTemp.toFixed(1) + " °C";
    elLand.textContent = sim ? sim.drops.filter(d => d.locationType === 'COASTAL').length : 0;

    // Update detailed statistics
    updateSummaryStats();
}

function updateSummaryStats() {
    if (!sim || sim.drops.length === 0) return;

    const drops = sim.drops;

    // Land ratio (water % = 100 - land%)
    const waterPct = sim.stats.totalAttempts > 0
        ? ((sim.stats.totalAttempts - sim.stats.landAttempts) / sim.stats.totalAttempts * 100).toFixed(1)
        : '--';
    document.getElementById('stat-land-ratio').textContent = `${waterPct}% water`;

    // Coastal count (within 1km)
    const coastalDrops = drops.filter(d => d.distanceKm !== null && d.distanceKm <= 1);
    document.getElementById('stat-coastal-count').textContent = `${coastalDrops.length} (${(coastalDrops.length / drops.length * 100).toFixed(1)}%)`;

    // Find closest and farthest drops
    const dropsWithDist = drops.filter(d => d.distanceKm !== null && d.distanceKm > 0);
    if (dropsWithDist.length > 0) {
        const closest = dropsWithDist.reduce((a, b) => a.distanceKm < b.distanceKm ? a : b);
        const farthest = dropsWithDist.reduce((a, b) => a.distanceKm > b.distanceKm ? a : b);

        const formatDist = (km) => km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(0)}km`;
        document.getElementById('stat-closest').textContent = formatDist(closest.distanceKm);
        document.getElementById('stat-farthest').textContent = formatDist(farthest.distanceKm);
    }

    // Average distance
    if (dropsWithDist.length > 0) {
        const avgDist = dropsWithDist.reduce((sum, d) => sum + d.distanceKm, 0) / dropsWithDist.length;
        document.getElementById('stat-avg-dist').textContent = `${avgDist.toFixed(0)}km`;
    }

    // Temperature stats
    const avgTemp = drops.reduce((sum, d) => sum + d.temp, 0) / drops.length;
    document.getElementById('stat-avg-temp').textContent = `${avgTemp.toFixed(1)}°C`;

    // Cold water (<4°C)
    const coldDrops = drops.filter(d => d.temp < 4);
    document.getElementById('stat-cold-pct').textContent = `${(coldDrops.length / drops.length * 100).toFixed(1)}%`;

    // Warm water (>24°C)
    const warmDrops = drops.filter(d => d.temp > 24);
    document.getElementById('stat-warm-pct').textContent = `${(warmDrops.length / drops.length * 100).toFixed(1)}%`;
}

function updateUI(drop, stats) {
    if (drop) {
        // Render Drop
        const [x, y] = projection([drop.lon, drop.lat]);
        if (x && y) {
            let color = "#0ea5e9";
            // Map Visuals - only highlight coastal prominently
            if (drop.locationType === 'COASTAL') color = "#ef4444";
            else if (drop.locationType === 'SHELF') color = "#fbbf24";

            const circle = gDrops.append("circle")
                .attr("cx", x)
                .attr("cy", y)
                .attr("r", 3)
                .attr("fill", color)
                .attr("class", "drop-point")
                .attr("data-lat", drop.lat)
                .attr("data-lon", drop.lon)
                .attr("data-day", drop.day)
                .style("cursor", "pointer")
                .on("click", () => {
                    openGoogleMaps(drop.lat, drop.lon);
                });

            circle.transition()
                .duration(500)
                .attr("r", 2);
        }

        // Log entry with Google Maps button
        const li = document.createElement('li');
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";

        let locText = "DEEP OCEAN";
        let colorStyle = "#0ea5e9";

        if (drop.locationType === 'COASTAL') {
            locText = "NEAR SHORE";
            colorStyle = "#ef4444";
        } else if (drop.locationType === 'SHELF') {
            locText = "CONT. SHELF";
            colorStyle = "#fbbf24";
        } else if (drop.locationType === 'FAR') {
            locText = "FAR OFFSHORE";
            colorStyle = "#22c55e";
        }

        const textSpan = document.createElement('span');
        textSpan.style.color = colorStyle;

        // Format distance for display
        let distText = '';
        if (drop.distanceKm !== null && drop.distanceKm !== undefined) {
            if (drop.distanceKm < 1) {
                distText = `${Math.round(drop.distanceKm * 1000)}m`;
            } else {
                distText = `${drop.distanceKm.toFixed(1)}km`;
            }
        }

        textSpan.textContent = `Day ${drop.day}: ${locText} [${distText}] (${drop.lat.toFixed(1)}, ${drop.lon.toFixed(1)}) ${drop.temp.toFixed(1)}°C`;

        const mapBtn = document.createElement('button');
        mapBtn.textContent = "🗺️";
        mapBtn.title = "Open in Google Maps";
        mapBtn.className = "map-btn";
        mapBtn.onclick = () => openGoogleMaps(drop.lat, drop.lon);

        li.appendChild(textSpan);
        li.appendChild(mapBtn);

        // No limit - allow scrolling all entries
        elLog.prepend(li);
    }

    if (stats) {
        updateStats(stats);
        if (sim) elDay.textContent = `${sim.currentDay} / ${sim.totalDays}`;

        // Throttle Chart Updates
        if (sim && sim.currentDay % 10 === 0) updateCharts(sim.drops);
    }
}

// Charts
const margin = { top: 10, right: 10, bottom: 40, left: 40 };
const chartWidth = 300 - margin.left - margin.right;
const chartHeight = 200 - margin.top - margin.bottom;

const svgTemp = d3.select("#chart-temp").append("svg")
    .attr("width", chartWidth + margin.left + margin.right)
    .attr("height", chartHeight + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const svgDist = d3.select("#chart-dist").append("svg")
    .attr("width", chartWidth + margin.left + margin.right)
    .attr("height", chartHeight + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

function updateCharts(data) {
    if (!data) return;

    // 1. Temp Histogram
    const xTemp = d3.scaleLinear()
        .domain([-5, 35])
        .range([0, chartWidth]);

    const histogram = d3.bin()
        .value(d => d.temp)
        .domain(xTemp.domain())
        .thresholds(xTemp.ticks(20));

    const bins = histogram(data);

    const yTemp = d3.scaleLinear()
        .range([chartHeight, 0])
        .domain([0, d3.max(bins, d => d.length) || 0]);

    svgTemp.selectAll("*").remove();

    svgTemp.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(xTemp).ticks(5));

    svgTemp.append("g")
        .call(d3.axisLeft(yTemp).ticks(5));

    svgTemp.selectAll("rect")
        .data(bins)
        .join("rect")
        .attr("x", 1)
        .attr("transform", d => `translate(${xTemp(d.x0)}, ${yTemp(d.length)})`)
        .attr("width", d => Math.max(0, xTemp(d.x1) - xTemp(d.x0) - 1))
        .attr("height", d => chartHeight - yTemp(d.length))
        .style("fill", "#0ea5e9")
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            applyFilter({ tempMin: d.x0, tempMax: d.x1 });
        });

    // 2. Distance Bar Chart
    const distCounts = {
        'COASTAL': 0,
        'SHELF': 0,
        'FAR': 0,
        'DEEP_OCEAN': 0
    };

    data.forEach(d => {
        if (distCounts[d.locationType] !== undefined) distCounts[d.locationType]++;
    });

    const distData = Object.entries(distCounts).map(([key, val]) => ({ key, val }));

    const xDist = d3.scaleBand()
        .range([0, chartWidth])
        .domain(['COASTAL', 'SHELF', 'FAR', 'DEEP_OCEAN'])
        .padding(0.2);

    const yDist = d3.scaleLinear()
        .domain([0, d3.max(distData, d => d.val) || 0])
        .range([chartHeight, 0]);

    svgDist.selectAll("*").remove();

    svgDist.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(xDist).tickFormat(d => {
            if (d === 'COASTAL') return 'Coast';
            if (d === 'SHELF') return 'Shelf';
            if (d === 'FAR') return 'Far';
            return 'Deep';
        }));

    svgDist.append("g").call(d3.axisLeft(yDist).ticks(5));

    const colorMap = {
        'COASTAL': '#ef4444',
        'SHELF': '#fbbf24',
        'FAR': '#22c55e',
        'DEEP_OCEAN': '#334155'
    };

    svgDist.selectAll("mybar")
        .data(distData)
        .join("rect")
        .attr("x", d => xDist(d.key))
        .attr("y", d => yDist(d.val))
        .attr("width", xDist.bandwidth())
        .attr("height", d => chartHeight - yDist(d.val))
        .attr("fill", d => colorMap[d.key] || '#999')
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            applyFilter({ zone: d.key });
        });
}

// --- Filtering ---
let currentFilter = null;

function applyFilter(filter) {
    currentFilter = filter;

    if (!sim || !sim.drops) return;

    // Filter drops
    const filtered = sim.drops.filter(d => {
        if (filter.tempMin !== undefined && filter.tempMax !== undefined) {
            return d.temp >= filter.tempMin && d.temp < filter.tempMax;
        }
        if (filter.zone) {
            return d.locationType === filter.zone;
        }
        return true;
    });

    // Update map - dim non-matching, highlight matching
    gDrops.selectAll("circle").each(function () {
        const day = +this.getAttribute("data-day");
        const match = filtered.some(d => d.day === day);
        d3.select(this)
            .style("opacity", match ? 1 : 0.1)
            .attr("r", match ? 4 : 2);
    });

    // Update log - show only matching
    const allItems = elLog.querySelectorAll('li');
    allItems.forEach(li => {
        const text = li.textContent;
        const matchesFilter = filtered.some(d => text.includes(`Day ${d.day}:`));
        li.style.display = matchesFilter ? 'flex' : 'none';
    });

    // Show filter indicator
    showFilterIndicator(filter);
}

function clearFilter() {
    currentFilter = null;

    // Reset map
    gDrops.selectAll("circle")
        .style("opacity", 0.8)
        .attr("r", 2);

    // Reset log
    const allItems = elLog.querySelectorAll('li');
    allItems.forEach(li => li.style.display = 'flex');

    hideFilterIndicator();
}

function showFilterIndicator(filter) {
    let indicator = document.getElementById('filter-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'filter-indicator';
        document.getElementById('controls').appendChild(indicator);
    }

    let text = 'Filter: ';
    if (filter.tempMin !== undefined) {
        text += `${filter.tempMin}°C - ${filter.tempMax}°C`;
    } else if (filter.zone) {
        const names = { COASTAL: 'Coastal', SHELF: 'Shelf', FAR: 'Far', DEEP_OCEAN: 'Deep' };
        text += names[filter.zone] || filter.zone;
    }

    indicator.innerHTML = `${text} <button onclick="clearFilter()">✕</button>`;
    indicator.style.display = 'flex';
}

function hideFilterIndicator() {
    const indicator = document.getElementById('filter-indicator');
    if (indicator) indicator.style.display = 'none';
}

// --- Sorting ---
let currentSort = 'day';

function sortAndRenderLog() {
    if (!sim || sim.drops.length === 0) return;

    let sortedDrops = [...sim.drops];

    switch (currentSort) {
        case 'distance':
            sortedDrops.sort((a, b) => (a.distanceKm || Infinity) - (b.distanceKm || Infinity));
            break;
        case 'temp':
            sortedDrops.sort((a, b) => a.temp - b.temp);
            break;
        case 'day':
        default:
            sortedDrops.sort((a, b) => b.day - a.day); // Newest first
            break;
    }

    // Clear and re-render log
    elLog.innerHTML = '';
    sortedDrops.forEach(drop => {
        renderLogEntry(drop);
    });
}

function renderLogEntry(drop) {
    const li = document.createElement('li');
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";

    let locText = "DEEP OCEAN";
    let colorStyle = "#0ea5e9";

    if (drop.locationType === 'COASTAL') {
        locText = "NEAR SHORE";
        colorStyle = "#ef4444";
    } else if (drop.locationType === 'SHELF') {
        locText = "CONT. SHELF";
        colorStyle = "#fbbf24";
    } else if (drop.locationType === 'FAR') {
        locText = "FAR OFFSHORE";
        colorStyle = "#22c55e";
    }

    const textSpan = document.createElement('span');
    textSpan.style.color = colorStyle;

    let distText = '';
    if (drop.distanceKm !== null && drop.distanceKm !== undefined) {
        if (drop.distanceKm < 1) {
            distText = `${Math.round(drop.distanceKm * 1000)}m`;
        } else {
            distText = `${drop.distanceKm.toFixed(1)}km`;
        }
    }

    textSpan.textContent = `Day ${drop.day}: ${locText} [${distText}] (${drop.lat.toFixed(1)}, ${drop.lon.toFixed(1)}) ${drop.temp.toFixed(1)}°C`;

    const mapBtn = document.createElement('button');
    mapBtn.textContent = "🗺️";
    mapBtn.title = "Open in Google Maps";
    mapBtn.className = "map-btn";
    mapBtn.onclick = () => openGoogleMaps(drop.lat, drop.lon);

    li.appendChild(textSpan);
    li.appendChild(mapBtn);
    elLog.appendChild(li);
}

// Initialize sort button listeners
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            sortAndRenderLog();
        });
    });
});

init();
