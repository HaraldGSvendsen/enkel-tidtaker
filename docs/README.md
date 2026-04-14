# Enkel tidtaker

## Ide
- Selvregistrering av starnummer, navn, løype (skjema via QR-link)
- Fellesstart med gitt starttid
- Registrering av startnummer og slutttid ved målgang (av funksjonær via web app)
- Nettside som viser resultat for de som har registrert seg. Mulig å skjule navn

Akritektur:  
- Google skjema til å registrere
- Google regneark for å samle data
- Web app for å registrere målgang
- Google App Scripts å beregne
- Google regneark bublisert ark for å vise resultat (live)


TODO:  
- Auto save admin participants
- Add admin page warning on same bib registered more than once
- Add finish line warning if bib registered more than once
- DONE - Results: show all participants also if they don't have a finish time (yet)
- Add link from registration to results - and from results to registration
- Implement hide name logic


NOTE:  
- These files are stored in Google App Scripts associated with the Google Sheets file that contains the data:
  - webapp_finish.html (renamed finish.html)
  - webapp_admin.html (renamed admin.html)
  - kode.gs
