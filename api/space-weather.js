const ENDPOINTS = {
    solarRadioFlux: 'https://services.swpc.noaa.gov/json/solar-radio-flux.json',
    observedSsn: 'https://services.swpc.noaa.gov/json/solar-cycle/swpc_observed_ssn.json',
    predictedCycle: 'https://services.swpc.noaa.gov/json/solar-cycle/predicted-solar-cycle.json',
    electronFluenceForecast: 'https://services.swpc.noaa.gov/json/electron_fluence_forecast.json',
    kpForecast: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json'
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

function getSolarRadioFlux2695(record) {
    if (!record || !Array.isArray(record.details)) {
        return null;
    }

    const preferred = record.details.find((entry) => Number(entry.frequency) === 2695);
    if (preferred) {
        const preferredValue = Number(preferred.flux);
        if (Number.isFinite(preferredValue)) {
            return preferredValue;
        }
    }

    const fallback = record.details.find((entry) => Number.isFinite(Number(entry.flux)));
    return fallback ? Number(fallback.flux) : null;
}

function getPredictedCycleCurrentRecord(payload) {
    if (!Array.isArray(payload) || payload.length === 0) {
        return null;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentRecord = payload.find((entry) => entry && entry['time-tag'] === currentMonth);

    if (currentRecord) {
        return currentRecord;
    }

    return payload[payload.length - 1] || null;
}

function parseKpForecast(payload) {
    if (!Array.isArray(payload) || payload.length < 2) {
        return {
            labels: [],
            observed: [],
            estimated: []
        };
    }

    const rows = payload
        .slice(1)
        .filter((row) => Array.isArray(row) && row.length >= 3)
        .map((row) => {
            const timeTag = String(row[0] || '');
            const kp = Number(row[1]);
            const type = String(row[2] || '').toLowerCase();

            return {
                timeTag,
                kp,
                type
            };
        })
        .filter((row) => row.timeTag && Number.isFinite(row.kp));

    const recentRows = rows.slice(-40);

    return {
        labels: recentRows.map((row) => row.timeTag.slice(5, 16)),
        observed: recentRows.map((row) => (row.type === 'observed' ? row.kp : null)),
        estimated: recentRows.map((row) => (row.type !== 'observed' ? row.kp : null))
    };
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

    const solarRadioFluxRecord = getLatestArrayEntry(payloadByName.solarRadioFlux);
    const observedSsnRecord = getLatestArrayEntry(payloadByName.observedSsn);
    const predictedCycleRecord = getPredictedCycleCurrentRecord(payloadByName.predictedCycle);
    const electronFluenceRecord = getLatestArrayEntry(payloadByName.electronFluenceForecast);
    const kpForecast = parseKpForecast(payloadByName.kpForecast);

    const metrics = {
        solarRadioFlux2695: getSolarRadioFlux2695(solarRadioFluxRecord),
        observedSsn: getNumericValue(observedSsnRecord, ['swpc_ssn']),
        predictedSsn: getNumericValue(predictedCycleRecord, ['predicted_ssn']),
        predictedF107: getNumericValue(predictedCycleRecord, ['predicted_f10.7']),
        electronFluence: getNumericValue(electronFluenceRecord, ['fluence']),
        electronForecastSpeed: getNumericValue(electronFluenceRecord, ['speed'])
    };

    const availableSources = Object.values(sourceStatus).filter((entry) => entry.ok).length;

    return response.status(200).json({
        metrics,
        kpForecast,
        sourceStatus,
        availableSources,
        totalSources: Object.keys(ENDPOINTS).length,
        updatedAt: new Date().toISOString()
    });
};