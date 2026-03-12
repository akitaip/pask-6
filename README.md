# Sėkmės Koeficiento Nustatymas

Frontend žaidimas su Supabase autentifikacija, Supabase duomenų saugojimu ir Vercel diegimu.

## Kas pakeista

- Vartotojų registracija ir prisijungimas vyksta per Supabase Auth
- Vartotojo vardas saugomas `profiles` lentelėje
- Spėjimų istorija saugoma `guesses` lentelėje
- Statistika saugoma `user_stats` lentelėje
- Frontendas Supabase konfigūraciją pasiima iš Vercel funkcijos `api/config.js`

## Reikalingi žingsniai Supabase pusėje

1. Susikurkite Supabase projektą.
2. Atidarykite SQL Editor.
3. Įvykdykite SQL iš `supabase/schema.sql`.
4. Auth nustatymuose įjunkite `Email` provider.
5. Jei norite sklandesnio testo be patvirtinimo laiškų, laikinai išjunkite `Confirm email`.

## Reikalingi Vercel aplinkos kintamieji

Vercel projekte pridėkite šiuos Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Galite juos pridėti per Vercel Dashboard arba CLI:

```powershell
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
```

Po pakeitimų perleiskite deploy.

## Lokalus paleidimas

Šis projektas naudoja `api/config.js`, todėl paprastas `python -m http.server` nepakanka.

Paleidimas:

```powershell
vercel dev
```

Arba naudokite `paleisti.bat`.

## Diegimas į Vercel

```powershell
vercel
vercel --prod
```

## Projekto struktūra

- `index.html` - UI
- `app.js` - žaidimo logika, Supabase auth ir DB užklausos
- `styles.css` - stiliai
- `api/config.js` - Vercel funkcija, grąžinanti viešą Supabase konfigūraciją frontendui
- `supabase/schema.sql` - DB schema, triggeriai ir RLS policy
- `.env.example` - pavyzdiniai kintamųjų pavadinimai

## Saugumo pastabos

- Į frontendą nepatenka `service_role` raktas.
- Naudojamas tik `SUPABASE_ANON_KEY`.
- Duomenų apsauga realizuota per RLS policy.

## Pastabos

- Esami `localStorage` vartotojai ir spėjimai automatiškai nemigruojami.
- Jei reikia, migraciją galima parašyti atskiru vienkartiniu skriptu.
