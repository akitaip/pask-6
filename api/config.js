module.exports = (request, response) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return response.status(500).json({
            error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY'
        });
    }

    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json({
        supabaseUrl,
        supabaseAnonKey
    });
};
