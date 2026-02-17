/**
 * GiocaSconto - Memory Elettrodomestici
 * Logica: griglia 5x4, 10 coppie, punteggio, login telefono, CSV via API, codice sconto, demo mode.
 */

(function () {
  'use strict';

  // --- Config elettrodomestici (10 coppie) ---
  var ELETTRODOMESTICI = [
    { id: 'lavatrice', nome: 'Lavatrice' },
    { id: 'lavastoviglie', nome: 'Lavastoviglie' },
    { id: 'frigorifero', nome: 'Frigorifero' },
    { id: 'forno', nome: 'Forno' },
    { id: 'piano_cottura', nome: 'Piano cottura' },
    { id: 'frullatore', nome: 'Frullatore' },
    { id: 'microonde', nome: 'Microonde' },
    { id: 'cappa', nome: 'Cappa' },
    { id: 'tostapane', nome: 'Tostapane' },
    { id: 'aspirapolvere', nome: 'Aspirapolvere' }
  ];

  // --- Stato ---
  var telefono = '';
  var punteggioCorrente = 0;
  var punteggioMassimo = 0;
  var codiceScontoUsato = false;
  var mazzo = [];           // array di id (20 elementi, 10 coppie)
  var firstCard = null;     // { el, id }
  var secondCard = null;
  var bloccoClick = false;
  var matchedCount = 0;
  var demoMode = false;
  var demoIntervalId = null;
  var inactivityTimerId = null;
  var codiceScontoAttuale = ''; /* Codice sconto vinto in questa partita (per popup fine) */
  var INATTIVITA_MS = 30000;
  var PUNTI_COPPIA = 150;
  var PUNTI_ERRORE = 50;
  var SOGLIA_SCONTO = 1000;
  var FLIP_DURATION_MS = 500; /* deve coincidere con transition in CSS */
  var TEMPO_MASSIMO_MS = 2 * 60 * 1000; /* 2 minuti */
  var gameTimerId = null;
  var tempoRimastoMs = 0;
  var STORAGE_KEY = 'giocasconto_giocatori'; /* localStorage: { telefono: { punteggio_massimo, codice_sconto_usato, codice_sconto, data_sconto, data_ultima_partita } } */
  var MESE_MS = 30 * 24 * 60 * 60 * 1000; /* 30 giorni: non può giocare di nuovo prima */
  var dataUltimaPartita = null; /* ISO string: ultima partita del giocatore (letto da localStorage) */

  // --- DOM ---
  var loginSection = document.getElementById('login-section');
  var scoreArea = document.getElementById('score-area');
  var telefonoInput = document.getElementById('telefono');
  var telefonoError = document.getElementById('telefono-error');
  var loginForm = document.getElementById('login-form');
  var punteggioDisplay = document.getElementById('punteggio-display');
  var timerDisplay = document.getElementById('timer-display');
  var grigliaCarte = document.getElementById('griglia-carte');
  var popupFinePartita = document.getElementById('popup-fine-partita');
  var punteggioFinaleEl = document.getElementById('punteggio-finale');
  var finePartitaScontoEl = document.getElementById('fine-partita-sconto');
  var finePartitaDispiacereEl = document.getElementById('fine-partita-dispiacere');
  var btnOkFine = document.getElementById('btn-ok-fine');
  var popupSconto = document.getElementById('popup-sconto');
  var codiceScontoTesto = document.getElementById('codice-sconto-testo');
  var btnChiudiSconto = document.getElementById('btn-chiudi-sconto');

  /**
   * Shuffle Fisher-Yates in place
   */
  function fisherYates(arr) {
    var i = arr.length;
    var j, t;
    while (i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /**
   * Genera codice sconto: SCONTO + ultime 4 cifre + checksum (lettera)
   */
  function generaCodiceSconto(numTel) {
    var str = String(numTel).replace(/\D/g, '');
    var ultime4 = str.slice(-4);
    if (ultime4.length < 4) ultime4 = ultime4.padStart(4, '0');
    var somma = 0;
    for (var k = 0; k < str.length; k++) somma += parseInt(str[k], 10);
    var checksum = String.fromCharCode(65 + (somma % 26));
    return 'SCONTO' + ultime4 + checksum;
  }

  /**
   * Aggiorna solo il display del punteggio. Lo sconto si assegna solo a fine partita in base al punteggio finale.
   */
  function aggiornaPunteggioDisplay() {
    punteggioDisplay.textContent = punteggioCorrente;
  }

  function chiudiPopupSconto() {
    if (popupSconto) popupSconto.hidden = true;
  }

  /**
   * Crea elemento carta (fronte = img o placeholder testo, retro = coperta)
   */
  function creaCarta(id, index) {
    var info = ELETTRODOMESTICI.find(function (e) { return e.id === id; });
    var nome = info ? info.nome : id;
    var imgPath = 'images/' + id + '.png';

    var div = document.createElement('div');
    div.className = 'carta';
    div.setAttribute('role', 'gridcell');
    div.dataset.id = id;
    div.dataset.index = String(index);

    var inner = document.createElement('div');
    inner.className = 'carta-inner';

    var back = document.createElement('div');
    back.className = 'carta-back';
    var backImg = document.createElement('img');
    backImg.src = 'images/tessera.png';
    backImg.alt = '';
    back.appendChild(backImg);

    var front = document.createElement('div');
    front.className = 'carta-front';
    var img = document.createElement('img');
    img.src = imgPath;
    img.alt = nome;
    img.onerror = function () {
      img.style.display = 'none';
      var placeholder = document.createElement('span');
          placeholder.className = 'placeholder-text';
          placeholder.textContent = nome;
      front.appendChild(placeholder);
    };
    front.appendChild(img);

    inner.appendChild(back);
    inner.appendChild(front);
    div.appendChild(inner);

    div.addEventListener('click', function () { onCartaClick(div, id, index); });
    return div;
  }

  /**
   * Reset timer inattività (per demo mode). Parte solo se l'utente NON è loggato.
   */
  function resetInactivityTimer() {
    if (inactivityTimerId) clearTimeout(inactivityTimerId);
    if (demoMode) return;
    if (telefono) return; /* Demo solo se utente sloggato (non durante partita) */
    inactivityTimerId = setTimeout(function () {
      avviaDemoMode();
    }, INATTIVITA_MS);
  }

  /**
   * Demo mode: scopre coppie a caso, punteggio non salvato.
   * Quando finisce, dopo una pausa rimischia le carte e ricomincia.
   */
  function avviaDemoMode() {
    if (demoMode || matchedCount === 10) return;
    demoMode = true;
    var carte = grigliaCarte.querySelectorAll('.carta:not(.matched)');
    var indici = [];
    for (var i = 0; i < carte.length; i++) indici.push(i);
    fisherYates(indici);
    var pos = 0;
    function mostraProssimaCoppia() {
      if (!demoMode || pos >= indici.length - 1) return;
      var i1 = indici[pos];
      var i2 = indici[pos + 1];
      var c1 = carte[i1];
      var c2 = carte[i2];
      if (c1 && !c1.classList.contains('flipped')) c1.classList.add('flipped');
      if (c2 && !c2.classList.contains('flipped')) c2.classList.add('flipped');
      /* Effetto pulse+glow solo dopo animazione flip, e solo se coppia reale */
      if (c1 && c2 && c1.dataset.id === c2.dataset.id) {
        setTimeout(function () {
          c1.classList.add('matched');
          c2.classList.add('matched');
        }, FLIP_DURATION_MS);
      }
      pos += 2;
      if (pos < indici.length) {
        demoIntervalId = setTimeout(mostraProssimaCoppia, 1400);
      } else {
        /* Demo finita: dopo una pausa rimischia e ricomincia (solo se ancora in demo e nessun login) */
        demoIntervalId = setTimeout(function () {
          if (demoMode && !telefono) {
            demoMode = false;
            buildInitialGrid();
            avviaDemoMode();
          }
        }, 2500);
      }
    }
    mostraProssimaCoppia();
  }

  function interrompiDemoMode() {
    demoMode = false;
    if (demoIntervalId) {
      clearTimeout(demoIntervalId);
      demoIntervalId = null;
    }
    var carte = grigliaCarte.querySelectorAll('.carta');
    for (var i = 0; i < carte.length; i++) {
      var c = carte[i];
      if (!c.classList.contains('matched')) {
        c.classList.remove('flipped');
      }
    }
    if (telefono) resetInactivityTimer();
  }

  function onCartaClick(div, id, index) {
    /* Senza login non si gioca */
    if (!telefono) return;
    resetInactivityTimer();
    if (demoMode) {
      interrompiDemoMode();
      return;
    }
    if (bloccoClick) return;
    if (div.classList.contains('flipped') || div.classList.contains('matched')) return;
    if (firstCard && firstCard.el === div) return; // anti-doppio click

    div.classList.add('flipped');

    if (!firstCard) {
      firstCard = { el: div, id: id, index: index };
      return;
    }
    secondCard = { el: div, id: id, index: index };
    bloccoClick = true;

    /* Attiva confronto e punteggio solo a animazione flip completata */
    setTimeout(function () {
      if (firstCard.id === secondCard.id) {
        firstCard.el.classList.add('matched');
        secondCard.el.classList.add('matched');
        punteggioCorrente += PUNTI_COPPIA;
        if (punteggioCorrente > punteggioMassimo) punteggioMassimo = punteggioCorrente;
        aggiornaPunteggioDisplay();
        matchedCount += 1;
        firstCard = null;
        secondCard = null;
        bloccoClick = false;
        if (matchedCount === 10) finePartita();
      } else {
        punteggioCorrente = Math.max(0, punteggioCorrente - PUNTI_ERRORE);
        aggiornaPunteggioDisplay();
        setTimeout(function () {
          firstCard.el.classList.remove('flipped');
          secondCard.el.classList.remove('flipped');
          firstCard = null;
          secondCard = null;
          bloccoClick = false;
        }, 800);
      }
    }, FLIP_DURATION_MS);
  }

  function stopGameTimer() {
    if (gameTimerId) {
      clearInterval(gameTimerId);
      gameTimerId = null;
    }
  }

  function aggiornaTimerDisplay() {
    if (!timerDisplay) return;
    var sec = Math.max(0, Math.ceil(tempoRimastoMs / 1000));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    timerDisplay.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /**
   * Effetto coriandoli quando si mostra lo sconto nel popup fine partita.
   */
  function avviaCoriandoli() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var stage = document.createElement('div');
    stage.className = 'coriandoli-stage';
    var colori = ['#e74c3c', '#f1c40f', '#27ae60', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#c0392b'];
    var n = 50;
    var i;
    for (i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'coriandolo';
      var size = 6 + Math.floor(Math.random() * 7);
      var left = 10 + Math.random() * 80;
      var dur = 1.8 + Math.random() * 1.2;
      var delay = Math.random() * 0.5;
      var drift = (Math.random() - 0.5) * 80;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = left + '%';
      p.style.backgroundColor = colori[Math.floor(Math.random() * colori.length)];
      p.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      p.style.setProperty('--coriandolo-x', drift + 'px');
      p.style.animationDuration = dur + 's';
      p.style.animationDelay = delay + 's';
      stage.appendChild(p);
    }
    document.body.appendChild(stage);
    setTimeout(function () {
      if (stage.parentNode) stage.parentNode.removeChild(stage);
    }, 2500);
  }

  function finePartita() {
    stopGameTimer();
    /* Assegna codice sconto solo a fine partita, solo se il punteggio FINALE è >= soglia */
    if (punteggioCorrente >= SOGLIA_SCONTO && !codiceScontoUsato) {
      codiceScontoAttuale = generaCodiceSconto(telefono);
      codiceScontoUsato = true;
    }
    popupFinePartita.hidden = false;
    punteggioFinaleEl.textContent = punteggioCorrente;
    if (codiceScontoAttuale) {
      finePartitaScontoEl.textContent = 'Il tuo codice sconto del 10%: ' + codiceScontoAttuale;
      finePartitaScontoEl.hidden = false;
      finePartitaDispiacereEl.hidden = true;
      avviaCoriandoli();
    } else {
      finePartitaScontoEl.hidden = true;
      finePartitaDispiacereEl.textContent = 'Ci dispiace, non hai raggiunto il punteggio necessario per ottenere lo sconto. Riprova!';
      finePartitaDispiacereEl.hidden = false;
    }
    salvaGiocatore();
  }

  /**
   * Salva giocatore in localStorage (punteggio massimo, codice_sconto_usato, codice_sconto, data_sconto)
   */
  function salvaGiocatore() {
    try {
      var data = {};
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) data = JSON.parse(raw);
      } catch (e) {}
      var g = data[telefono] || { punteggio_massimo: 0, codice_sconto_usato: false };
      g.punteggio_massimo = Math.max(g.punteggio_massimo || 0, punteggioMassimo);
      g.codice_sconto_usato = g.codice_sconto_usato || codiceScontoUsato;
      if (codiceScontoAttuale) {
        g.codice_sconto = codiceScontoAttuale;
        g.data_sconto = new Date().toISOString();
      }
      g.data_ultima_partita = new Date().toISOString();
      data[telefono] = g;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage non disponibile */ }
  }

  /**
   * Carica dati giocatore da localStorage (se esiste)
   */
  function caricaGiocatore(callback) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        var g = data[telefono];
        if (g) {
          punteggioMassimo = g.punteggio_massimo || 0;
          codiceScontoUsato = g.codice_sconto_usato === true;
          dataUltimaPartita = g.data_ultima_partita || null;
          if (callback) callback();
          return;
        }
      }
    } catch (e) {}
    punteggioMassimo = 0;
    codiceScontoUsato = false;
    dataUltimaPartita = null;
    if (callback) callback();
  }

  function initGame() {
    stopGameTimer();
    matchedCount = 0;
    punteggioCorrente = 0;
    codiceScontoAttuale = '';
    firstCard = null;
    secondCard = null;
    bloccoClick = false;
    popupFinePartita.hidden = true;
    popupSconto.hidden = true;

    /* Timer 2 minuti: a scadenza fine partita */
    tempoRimastoMs = TEMPO_MASSIMO_MS;
    aggiornaTimerDisplay();
    gameTimerId = setInterval(function () {
      tempoRimastoMs -= 1000;
      aggiornaTimerDisplay();
      if (tempoRimastoMs <= 0) {
        stopGameTimer();
        finePartita();
      }
    }, 1000);

    // Ricostruisci mazzo: 10 coppie
    mazzo = [];
    for (var i = 0; i < ELETTRODOMESTICI.length; i++) {
      var id = ELETTRODOMESTICI[i].id;
      mazzo.push(id);
      mazzo.push(id);
    }
    fisherYates(mazzo);

    grigliaCarte.innerHTML = '';
    for (var j = 0; j < mazzo.length; j++) {
      var cartaEl = creaCarta(mazzo[j], j);
      grigliaCarte.appendChild(cartaEl);
    }

    punteggioDisplay.textContent = '0';
    resetInactivityTimer();
  }

  function mostraGioco() {
    loginSection.classList.add('hidden');
    scoreArea.hidden = false;
    initGame();
  }

  function validazioneTelefono(val) {
    var cifre = (val || '').replace(/\D/g, '');
    return cifre.length >= 8;
  }

  /**
   * Formatta data in gg/mm/aaaa per messaggi all'utente
   * @param {number} timestampMs
   * @returns {string}
   */
  function formattaDataGioco(timestampMs) {
    var d = new Date(timestampMs);
    var gg = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var aaaa = d.getFullYear();
    return gg + '/' + mm + '/' + aaaa;
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    telefonoError.textContent = '';
    var val = telefonoInput.value.trim();
    if (!validazioneTelefono(val)) {
      telefonoError.textContent = 'Inserisci almeno 8 cifre numeriche.';
      return;
    }
    interrompiDemoMode();
    telefono = val.replace(/\D/g, '');
    /* Controlla sconto già usato e cooldown di un mese */
    caricaGiocatore(function () {
      if (codiceScontoUsato) {
        telefonoError.textContent = 'Sconto già erogato per questo numero di telefono. Riprova tra qualche giorno.';
        telefono = '';
        /* Ripristina griglia e riavvia la demo */
        var carte = grigliaCarte.querySelectorAll('.carta');
        for (var i = 0; i < carte.length; i++) {
          carte[i].classList.remove('flipped', 'matched');
        }
        matchedCount = 0;
        firstCard = null;
        secondCard = null;
        setTimeout(function () { avviaDemoMode(); }, 300);
        return;
      }
      /* Non può giocare di nuovo se non è passato un mese dall'ultima partita */
      if (dataUltimaPartita) {
        var ultimaMs = new Date(dataUltimaPartita).getTime();
        var prossimaMs = ultimaMs + MESE_MS;
        if (Date.now() < prossimaMs) {
          telefonoError.textContent = 'Puoi giocare di nuovo dal ' + formattaDataGioco(prossimaMs) + '.';
          telefono = '';
          var carte = grigliaCarte.querySelectorAll('.carta');
          for (var i = 0; i < carte.length; i++) {
            carte[i].classList.remove('flipped', 'matched');
          }
          matchedCount = 0;
          firstCard = null;
          secondCard = null;
          setTimeout(function () { avviaDemoMode(); }, 300);
          return;
        }
      }
      mostraGioco();
    });
  });

  telefonoInput.addEventListener('input', function () {
    telefonoError.textContent = '';
  });

  /* Ok a fine partita: logout e ricomincia demo subito */
  btnOkFine.addEventListener('click', function () {
    popupFinePartita.hidden = true;
    popupSconto.hidden = true;
    telefono = '';
    codiceScontoAttuale = '';
    punteggioCorrente = 0;
    punteggioMassimo = 0;
    codiceScontoUsato = false;
    matchedCount = 0;
    firstCard = null;
    secondCard = null;
    demoMode = false;
    if (demoIntervalId) {
      clearTimeout(demoIntervalId);
      demoIntervalId = null;
    }
    if (inactivityTimerId) {
      clearTimeout(inactivityTimerId);
      inactivityTimerId = null;
    }
    loginSection.classList.remove('hidden');
    scoreArea.hidden = true;
    buildInitialGrid();
    /* Riavvia la demo subito dopo aver mostrato di nuovo login e griglia */
    setTimeout(function () {
      avviaDemoMode();
    }, 100);
  });

  btnChiudiSconto.addEventListener('click', chiudiPopupSconto);

  /* Reset timer inattività solo dopo login (demo parte dopo 30s senza interazione) */
  document.body.addEventListener('click', resetInactivityTimer);
  document.body.addEventListener('touchstart', resetInactivityTimer);

  /**
   * All'avvio: griglia visibile con carte coperte, login sotto. Demo parte subito.
   */
  function buildInitialGrid() {
    mazzo = [];
    for (var i = 0; i < ELETTRODOMESTICI.length; i++) {
      var id = ELETTRODOMESTICI[i].id;
      mazzo.push(id);
      mazzo.push(id);
    }
    fisherYates(mazzo);
    grigliaCarte.innerHTML = '';
    for (var j = 0; j < mazzo.length; j++) {
      var cartaEl = creaCarta(mazzo[j], j);
      grigliaCarte.appendChild(cartaEl);
    }
  }

  buildInitialGrid();
  /* Demo parte subito al caricamento (anche senza login) */
  setTimeout(function () {
    avviaDemoMode();
  }, 400);
})();
