# Farmàcia Martí — web i seguiment de clients

Web estàtica en català amb registre de clients i agenda interna de seguiments, preparada per funcionar amb GitHub Pages i Supabase. **La recollida real està desactivada per defecte.** No s’han creat comptes ni s’ha enviat cap dada a cap servei.

## Serveis gratuïts

- GitHub Pages per servir els fitxers estàtics.
- Supabase Free per a Postgres, Auth i una Edge Function. No afegir targeta ni activar cap servei de pagament. Els límits i condicions del pla gratuït poden canviar; si se superen, deixar el registre desactivat.
- El sistema no envia correus ni SMS automàtics. L’agenda interna prepara un esborrany de correu/SMS perquè el personal el revisi i l’enviï des del dispositiu de la farmàcia.

GitHub Pages no executa codi de servidor. El formulari públic cridarà una Supabase Edge Function; el panell `gestio.html` llegirà dades mitjançant Supabase Auth i polítiques RLS.[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## Funcions implementades

- Alta amb nom, mòbil, correu i espai d’interès.
- Consentiment per al seguiment, amb selecció separada de correu electrònic i SMS.
- Autoritzacions comercials opcionals i separades per canal.
- Agenda interna de recordatoris sense notes clíniques.
- Sol·licitud de cita, inscripció a activitats i consulta manual de disponibilitat de productes no medicinals.
- Catàleg públic d’11 serveis amb sol·licituds d’informació/cita revisades manualment per l’equip. Abans de publicar serveis reals, confirma’n la disponibilitat i les condicions. Les sol·licituds detallades requereixen la migració `202611150001_service_catalog.sql`.
- Formulari de preferències: les baixes s’apliquen a l’instant quan les dades actuals coincideixen; els canvis de mòbil/correu queden pendents de verificació del personal.
- Inici de sessió de personal, cercador, baixa de preferències i supressió de fitxa.
- RLS tanca la lectura pública; només les activitats publicades es poden llegir sense iniciar sessió. Només el personal registrat a `staff_members` pot veure clients, inscripcions i sol·licituds.
- La sessió interna s’emmagatzema a `sessionStorage`, es tanca en tancar la pestanya i els credencials de servei romanen a Supabase.

## Configuració de desenvolupament

1. Crea manualment un projecte Supabase al pla gratuït i tria una regió específica **Central EU (Frankfurt)**. Confirma al panell que el projecte és al pla Free i no afegeixis pagament.
2. Revisa [privacy.html](privacy.html) i valida el termini per a clients inactius, les dades contractuals del processador i qualsevol altra informació aplicable. La raó social i el criteri inicial de conservació indicats per la farmàcia ja hi consten. El document continua sent un esborrany; valida’l amb la persona assessora de protecció de dades abans d’obrir el registre.
3. Instal·la/usa el Supabase CLI gratuït des de la font oficial i autentica’t. Enllaça el repositori local al projecte.
4. Aplica l’esquema: `supabase db push`.
5. Desplega les funcions: `supabase functions deploy register-client` i `supabase functions deploy customer-request`.
6. A **Project Settings → API Keys**, copia l’URL del projecte i la clau **publishable** al camp `supabasePublishableKey` de `supabase-config.js`. Aquesta clau és pública; mai hi posis la clau **secret** al codi del navegador.
7. A la configuració de secrets de les Edge Functions, defineix `ALLOWED_ORIGINS` amb l’origen exacte del lloc (per exemple `https://francescsolsonatehas.github.io`) i `PRIVACY_NOTICE_VERSION` amb una versió final. Mantén `REGISTRATION_ENABLED=false` i `PUBLIC_REQUESTS_ENABLED=false` fins que l’avís i les mesures s’hagin revisat. Activa’ls a `true` només quan la farmàcia ho hagi decidit.
8. A **Authentication → Settings**, desactiva el registre públic d’usuaris. Crea comptes interns només per al personal autoritzat.
9. Per cada compte intern, afegeix l’identificador d’usuari a `staff_members` des de l’SQL Editor:

   ```sql
   insert into public.staff_members (user_id)
   values ('UUID-DE-L-USUARI-CREAT-A-AUTH');
   ```

10. Desplega els fitxers estàtics a GitHub Pages. Prova primer amb dades inventades i comprova que la taula `clients` no es pot consultar sense iniciar sessió.

## Registre i seguiment

El formulari no admet cap alta si no s’ha triat almenys un canal de seguiment, confirmat la lectura de l’avís i donat una autorització específica per al seguiment. La informació comercial és opcional, no premarcada i autoritzada separadament per correu electrònic i SMS. Les polítiques de la base de dades només permeten crear recordatoris per canals que el client hagi autoritzat. El panell només desa tipus d’acció, espai, canal i data; no té camps de diagnòstic ni notes lliures. Els recordatoris no s’envien automàticament. Les cites, places d’activitats i productes no es confirmen en línia: el personal revisa les peticions i contacta manualment.

## Pendents abans de dades reals

- Validar el responsable, les finalitats i bases jurídiques, la retenció, el processador, les transferències i el text de privacitat.
- Decidir la política interna per crear, revisar i tancar seguiments i per atendre sol·licituds d’accés/supressió.
- Desactivar el mode de registre tancat només després de validar el desplegament, l’accés restringit i la gestió d’incidents.

No guardar historial clínic, diagnòstics, medicació, fotografies ni informació sanitària en aquest sistema. Aquest prototip no certifica el compliment normatiu.
