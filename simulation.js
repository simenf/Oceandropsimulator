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
