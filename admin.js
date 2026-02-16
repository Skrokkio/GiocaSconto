/**
 * Admin GiocaSconto – Gestione giocatori in localStorage
 * Legge/scrive la stessa chiave usata da script.js: giocasconto_giocatori
 * Accesso protetto da password (sessionStorage: sessione corrente).
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'giocasconto_giocatori';
  var AUTH_KEY = 'giocasconto_admin_auth';
  var ADMIN_PASSWORD = '7398100';

  var loginWrap = document.getElementById('admin-login-wrap');
  var contentWrap = document.getElementById('admin-content-wrap');
  var loginForm = document.getElementById('admin-login-form');
  var passwordInput = document.getElementById('admin-password');
  var loginError = document.getElementById('admin-login-error');

  var tabellaBody = document.getElementById('tabella-body');
  var tabellaGiocatori = document.getElementById('tabella-giocatori');
  var adminVuoto = document.getElementById('admin-vuoto');
  var adminMessaggio = document.getElementById('admin-messaggio');
  var btnEsporta = document.getElementById('btn-esporta');
  var btnEliminaTutti = document.getElementById('btn-elimina-tutti');

  /**
   * Formatta data ISO in stringa leggibile (gg/mm/aaaa hh:mm)
   * @param {string} iso - es. 2025-02-16T14:30:00.000Z
   * @returns {string}
   */
  function formattaDataSconto(iso) {
    if (!iso) return '–';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      var gg = ('0' + d.getDate()).slice(-2);
      var mm = ('0' + (d.getMonth() + 1)).slice(-2);
      var aaaa = d.getFullYear();
      var hh = ('0' + d.getHours()).slice(-2);
      var min = ('0' + d.getMinutes()).slice(-2);
      return gg + '/' + mm + '/' + aaaa + ' ' + hh + ':' + min;
    } catch (e) {
      return iso;
    }
  }

  /**
   * Legge l'oggetto giocatori da localStorage (stessa struttura di script.js)
   * @returns {Object} { [telefono]: { punteggio_massimo, codice_sconto_usato, codice_sconto, data_sconto }, ... }
   */
  function leggiGiocatori() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  /**
   * Salva l'oggetto giocatori in localStorage
   * @param {Object} data
   */
  function salvaGiocatori(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      mostraMessaggio('Impossibile salvare.', true);
    }
  }

  /**
   * Mostra un messaggio temporaneo nella zona admin
   * @param {string} testo
   * @param {boolean} isError
   */
  function mostraMessaggio(testo, isError) {
    if (!adminMessaggio) return;
    adminMessaggio.textContent = testo;
    adminMessaggio.className = 'admin-messaggio' + (isError ? ' admin-messaggio-errore' : '');
    adminMessaggio.hidden = false;
    setTimeout(function () {
      adminMessaggio.textContent = '';
      adminMessaggio.className = 'admin-messaggio';
      adminMessaggio.hidden = true;
    }, 3000);
  }

  /**
   * Aggiorna la tabella con i dati correnti da localStorage
   */
  function aggiornaTabella() {
    var data = leggiGiocatori();
    var telefoni = Object.keys(data);

    if (tabellaBody) tabellaBody.innerHTML = '';
    if (tabellaGiocatori) tabellaGiocatori.hidden = telefoni.length === 0;
    if (adminVuoto) adminVuoto.hidden = telefoni.length > 0;

    telefoni.forEach(function (tel) {
      var g = data[tel] || {};
      var punteggio = g.punteggio_massimo != null ? g.punteggio_massimo : 0;
      var scontoUsato = g.codice_sconto_usato === true;
      var dataSconto = formattaDataSconto(g.data_sconto);
      var codiceSconto = g.codice_sconto ? escapeHtml(g.codice_sconto) : '–';
      var dataUltimaPartita = formattaDataSconto(g.data_ultima_partita);

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(tel) + '</td>' +
        '<td>' + escapeHtml(String(punteggio)) + '</td>' +
        '<td>' + (scontoUsato ? 'Sì' : 'No') + '</td>' +
        '<td>' + escapeHtml(dataSconto) + '</td>' +
        '<td>' + codiceSconto + '</td>' +
        '<td>' + escapeHtml(dataUltimaPartita) + '</td>' +
        '<td class="admin-cell-actions">' +
        '<button type="button" class="btn-admin btn-reset" data-telefono="' + escapeAttr(tel) + '">Reset</button> ' +
        '<button type="button" class="btn-admin btn-elimina-one" data-telefono="' + escapeAttr(tel) + '">Elimina</button>' +
        '</td>';
      if (tabellaBody) tabellaBody.appendChild(tr);
    });

    /* Re-attach listeners sui pulsanti appena creati */
    if (tabellaBody) {
      tabellaBody.querySelectorAll('.btn-reset').forEach(function (btn) {
        btn.addEventListener('click', function () { onReset(btn.getAttribute('data-telefono')); });
      });
      tabellaBody.querySelectorAll('.btn-elimina-one').forEach(function (btn) {
        btn.addEventListener('click', function () { onEliminaUno(btn.getAttribute('data-telefono')); });
      });
    }
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Reset per il telefono: azzera codice_sconto_usato, codice_sconto, data_sconto, data_ultima_partita
   * @param {string} telefono
   */
  function onReset(telefono) {
    if (!telefono) return;
    var data = leggiGiocatori();
    if (data[telefono]) {
      data[telefono].codice_sconto_usato = false;
      data[telefono].codice_sconto = '';
      data[telefono].data_sconto = null;
      data[telefono].data_ultima_partita = null;
      salvaGiocatori(data);
      aggiornaTabella();
      mostraMessaggio('Reset eseguito per ' + telefono);
    }
  }

  /**
   * Rimuove un singolo giocatore e aggiorna tabella
   * @param {string} telefono
   */
  function onEliminaUno(telefono) {
    if (!telefono) return;
    if (!confirm('Eliminare il giocatore ' + telefono + '?')) return;
    var data = leggiGiocatori();
    delete data[telefono];
    salvaGiocatori(data);
    aggiornaTabella();
    mostraMessaggio('Giocatore eliminato.');
  }

  /**
   * Elimina tutti i giocatori (conferma)
   */
  function onEliminaTutti() {
    if (!confirm('Eliminare tutti i giocatori? L\'operazione non si può annullare.')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      salvaGiocatori({});
    }
    aggiornaTabella();
    mostraMessaggio('Tutti i giocatori sono stati eliminati.');
  }

  /**
   * Esporta l'elenco in CSV (telefono;punteggio_massimo;codice_sconto_usato;data_sconto;codice_sconto)
   */
  function onEsportaCSV() {
    var data = leggiGiocatori();
    var telefoni = Object.keys(data);
    var righe = ['Telefono;Punteggio massimo;Codice sconto usato;Data sconto;Codice sconto;Data ultima partita'];
    telefoni.forEach(function (tel) {
      var g = data[tel] || {};
      var punteggio = g.punteggio_massimo != null ? g.punteggio_massimo : 0;
      var sconto = g.codice_sconto_usato ? 'Sì' : 'No';
      var dataSconto = g.data_sconto || '';
      var codiceSconto = (g.codice_sconto || '').replace(/;/g, ',');
      var dataUltimaPartita = g.data_ultima_partita || '';
      righe.push(tel + ';' + punteggio + ';' + sconto + ';' + dataSconto + ';' + codiceSconto + ';' + dataUltimaPartita);
    });
    var csv = righe.join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'giocasconto_giocatori_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    mostraMessaggio('CSV esportato.');
  }

  if (btnEliminaTutti) btnEliminaTutti.addEventListener('click', onEliminaTutti);
  if (btnEsporta) btnEsporta.addEventListener('click', onEsportaCSV);

  function mostraAdmin() {
    if (loginWrap) loginWrap.hidden = true;
    if (contentWrap) contentWrap.hidden = false;
    if (passwordInput) passwordInput.value = '';
    if (loginError) loginError.textContent = '';
    try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (e) {}
    aggiornaTabella();
  }

  function mostraLogin() {
    if (loginWrap) loginWrap.hidden = false;
    if (contentWrap) contentWrap.hidden = true;
  }

  if (loginForm && passwordInput) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (loginError) loginError.textContent = '';
      var pwd = (passwordInput.value || '').trim();
      if (pwd === ADMIN_PASSWORD) {
        mostraAdmin();
      } else {
        if (loginError) loginError.textContent = 'Password errata. Riprova.';
        passwordInput.focus();
      }
    });
  }

  /* All'uscita dalla pagina admin (link, indietro, chiusura tab) cancelliamo sempre le credenziali */
  function rimuoviCredenziali() {
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
  }

  window.addEventListener('pagehide', rimuoviCredenziali);
  window.addEventListener('beforeunload', rimuoviCredenziali);

  var btnBack = document.querySelector('a.btn-back[href="index.html"]');
  if (btnBack) {
    btnBack.addEventListener('click', function () {
      rimuoviCredenziali();
    });
  }

  /* Anche il link "Torna al gioco" nel modal di login */
  var loginBack = document.querySelector('#admin-login-wrap a[href="index.html"]');
  if (loginBack) {
    loginBack.addEventListener('click', function () {
      rimuoviCredenziali();
    });
  }

  try {
    if (sessionStorage.getItem(AUTH_KEY) === '1') {
      mostraAdmin();
    } else {
      mostraLogin();
    }
  } catch (e) {
    mostraLogin();
  }
})();
