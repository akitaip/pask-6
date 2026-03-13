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
6. Supabase `Authentication -> URL Configuration` nustatykite:
	- `Site URL`: jūsų realus app adresas (pvz. `https://jusu-projektas.vercel.app`)
	- `Redirect URLs`: pridėkite visus naudojamus adresus (pvz. `http://localhost:3000`, `https://jusu-projektas.vercel.app`)

## Reikalingi Vercel aplinkos kintamieji

Vercel projekte pridėkite šiuos Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `APP_URL` (rekomenduojama, pvz. `https://jusu-projektas.vercel.app`)

Galite juos pridėti per Vercel Dashboard arba CLI:

```powershell
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add APP_URL
```

Po pakeitimų perleiskite deploy.

`APP_URL` naudojamas registracijos patvirtinimo nuorodai (`redirect_to`), kad po el. pašto patvirtinimo būtų atidaromas Vercel adresas, o ne `localhost`.

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
