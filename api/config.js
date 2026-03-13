module.exports = (request, response) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const appUrlFromEnv = process.env.APP_URL;
    const forwardedProto = request.headers['x-forwarded-proto'];
    const forwardedHost = request.headers['x-forwarded-host'];
    const host = forwardedHost || request.headers.host;
    const protocol = forwardedProto || (host && host.includes('localhost') ? 'http' : 'https');
    const appUrl = appUrlFromEnv || (host ? `${protocol}://${host}` : null);

    if (!supabaseUrl || !supabaseAnonKey) {
        return response.status(500).json({
            error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY'
        });
    }

    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json({
        supabaseUrl,
        supabaseAnonKey,
        appUrl
    });
};
