# Sėkmės Koeficiento Nustatymas

Desktop HTML programa sėkmės koeficiento nustatymui pagal spėjimo tikslumą.

## Funkcionalumas

### Pagrindinės funkcijos:
- **Vartotojo registracija ir prisijungimas** - saugomi localStorage
- **10x10 skaičių lentelė** - nesikartojantys skaičiai nuo 0 iki 99
- **Atsitiktinis tikslas** - kas 3 sekundes keičiasi:
  - Skaičius lentelėje
  - Eilutė
  - Stulpelis
- **Spėjimo sistema** - paspaudus langelį:
  - 1 taškas už teisingą skaičių
  - 0.1 taško už teisingą eilutę
  - 0.1 taško už teisingą stulpelį
- **Sėkmės koeficientas** - nuo 0.01 iki 1.00
- **Streak sistema** - 2 kartus iš eilės atspėjus skaičių, koeficientas padauginamas 4 kartus
- **Statistika** - rodoma po 25, 50, 75, 100 spėjimų
- **Grafikas** - visi spėjimai realaus laiko ašyje
- **Prognozė** - 15 min į priekį pagal tiesinę regresiją

## Naudojimas

1. Atidarykite `index.html` naršyklėje
2. Registruokitės arba prisijunkite
3. Spėkite langelius lentelėje
4. Stebėkite savo sėkmės koeficientą ir grafiką

## Technologijos

- HTML5
- CSS3
- JavaScript (ES6+)
- Chart.js (grafikams)
- localStorage (duomenų saugojimui)

## Pastabos

- Duomenys saugomi naršyklės localStorage
- Spalvos indikatorius keičiasi kas 3 sekundes kartu su tikslu
- Grafikas atnaujinamas automatiškai po kiekvieno spėjimo
