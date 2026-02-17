/**
 * Backend GiocaSconto: serve statici e API per giocatori (CSV)
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const CSV_PATH = path.join(__dirname, 'giocatori.csv');
const CSV_HEADER = 'telefono,punteggio_massimo,codice_sconto_usato\n';

/* Crea il file CSV con la sola intestazione all'avvio se non esiste */
if (!fs.existsSync(CSV_PATH)) {
  fs.writeFileSync(CSV_PATH, CSV_HEADER, 'utf8');
  console.log('Creato file:', CSV_PATH);
}

app.use(express.json());
app.use(express.static(__dirname));

/**
 * Legge il file CSV e restituisce array di oggetti { telefono, punteggio_massimo, codice_sconto_usato }
 */
function leggiCSV() {
  if (!fs.existsSync(CSV_PATH)) {
    return [];
  }
  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  const header = lines[0];
  if (header !== 'telefono,punteggio_massimo,codice_sconto_usato') {
    return [];
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 3) {
      rows.push({
        telefono: parts[0].trim(),
        punteggio_massimo: parseInt(parts[1].trim(), 10) || 0,
        codice_sconto_usato: parts[2].trim().toLowerCase() === 'true'
      });
    }
  }
  return rows;
}

/**
 * Scrive l'array di giocatori nel CSV
 */
function scriviCSV(rows) {
  const lines = [CSV_HEADER.trim()];
  for (const r of rows) {
    lines.push(`${r.telefono},${r.punteggio_massimo},${r.codice_sconto_usato}`);
  }
  fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n', 'utf8');
}

/**
 * GET /api/giocatore?telefono=XXX
 */
app.get('/api/giocatore', (req, res) => {
  const telefono = (req.query.telefono || '').toString().replace(/\D/g, '');
  if (!telefono) {
    return res.status(400).json({ error: 'Telefono mancante' });
  }
  const rows = leggiCSV();
  const giocatore = rows.find(r => r.telefono === telefono);
  if (!giocatore) {
    return res.status(404).json({ error: 'Non trovato' });
  }
  res.json(giocatore);
});

/**
 * POST /api/giocatore
 * Body: { telefono, punteggio_massimo, codice_sconto_usato }
 * Se esiste: aggiorna punteggio_massimo (solo se maggiore) e codice_sconto_usato
 * Altrimenti: nuova riga
 */
app.post('/api/giocatore', (req, res) => {
  let telefono = (req.body.telefono || '').toString().replace(/\D/g, '');
  const punteggio_massimo = parseInt(req.body.punteggio_massimo, 10) || 0;
  const codice_sconto_usato = Boolean(req.body.codice_sconto_usato);

  if (!telefono) {
    return res.status(400).json({ error: 'Telefono mancante' });
  }

  let rows = leggiCSV();
  const idx = rows.findIndex(r => r.telefono === telefono);

  if (idx >= 0) {
    const existing = rows[idx];
    existing.punteggio_massimo = Math.max(existing.punteggio_massimo, punteggio_massimo);
    existing.codice_sconto_usato = existing.codice_sconto_usato || codice_sconto_usato;
  } else {
    rows.push({
      telefono,
      punteggio_massimo,
      codice_sconto_usato
    });
  }

  scriviCSV(rows);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('GiocaSconto in ascolto su http://localhost:' + PORT);
  console.log('I punteggi e gli sconti vengono salvati in: giocatori.csv');
  console.log('Apri il gioco da http://localhost:' + PORT + ' (non come file)');
});
