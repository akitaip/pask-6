const ENDPOINTS = {
    f107: 'https://services.swpc.noaa.gov/json/f107_cm_flux.json',
    xray: 'https://services.swpc.noaa.gov/json/goes/xray/5m.json',
    solarWind: 'https://services.swpc.noaa.gov/json/ace/solar_wind/1-day.json'
};

async function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'user-agent': 'pask-6-space-weather'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

function getLatestArrayEntry(payload) {
    if (!Array.isArray(payload) || payload.length === 0) {
        return null;
    }

    return payload[payload.length - 1] || null;
}

function getNumericValue(record, keys) {
    if (!record || typeof record !== 'object') {
        return null;
    }

    for (const key of keys) {
        if (!(key in record)) {
            continue;
        }

        const value = Number(record[key]);
        if (Number.isFinite(value)) {
            return value;
        }
    }

    return null;
}

module.exports = async (request, response) => {
    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

    const settled = await Promise.all(
        Object.entries(ENDPOINTS).map(async ([name, url]) => {
            try {
                const data = await fetchWithTimeout(url);
                return { name, ok: true, data };
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                return { name, ok: false, error: reason };
            }
        })
    );

    const payloadByName = {};
    const sourceStatus = {};

    for (const result of settled) {
        if (result.ok) {
            payloadByName[result.name] = result.data;
            sourceStatus[result.name] = { ok: true };
            continue;
        }

        sourceStatus[result.name] = {
            ok: false,
            error: result.error
        };
    }

    for (const key of Object.keys(ENDPOINTS)) {
        if (!(key in sourceStatus)) {
            sourceStatus[key] = { ok: false, error: 'Unknown error' };
        }
    }

    const f107Record = getLatestArrayEntry(payloadByName.f107);
    const xrayRecord = getLatestArrayEntry(payloadByName.xray);
    const solarWindRecord = getLatestArrayEntry(payloadByName.solarWind);

    const metrics = {
        f107Value: getNumericValue(f107Record, ['f107', 'f107_cm_flux', 'flux']),
        xrayValue: getNumericValue(xrayRecord, ['flux', 'observed_flux', 'xray_flux']),
        solarWindSpeed: getNumericValue(solarWindRecord, ['speed', 'sw_speed', 'velocity'])
    };

    const availableSources = Object.values(sourceStatus).filter((entry) => entry.ok).length;

    return response.status(200).json({
        metrics,
        sourceStatus,
        availableSources,
        totalSources: Object.keys(ENDPOINTS).length,
        updatedAt: new Date().toISOString()
    });
};