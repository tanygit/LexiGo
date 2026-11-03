(() => {
  const ROWS = 6, COLS = 5;
  const KEY_LAYOUT = ["qwertyuiop", "asdfghjkl", ["enter", ..."zxcvbnm", "back"]];

  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const toastEl = document.getElementById("toast");
  const modalEl = document.getElementById("modal");

  const validCache = new Map();
  const defCache = new Map();
  let wordPool = null; // common 5-letter words fetched online

  const MAX_HINTS = 3;
  const hintSlotsEl = document.getElementById("hint-slots");
  const hintBtn = document.getElementById("hint-btn");
  const hintLabel = document.getElementById("hint-label");

  let answer, row, col, guesses, over, busy, keyState, tiles, hints, hintSlots;

  /* ---------- setup ---------- */
  function buildBoard() {
    boardEl.innerHTML = "";
    tiles = [];
    for (let r = 0; r < ROWS; r++) {
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      const rowTiles = [];
      for (let c = 0; c < COLS; c++) {
        const t = document.createElement("div");
        t.className = "tile";
        rowEl.appendChild(t);
        rowTiles.push(t);
      }
      boardEl.appendChild(rowEl);
      tiles.push(rowTiles);
    }
  }

  function buildKeyboard() {
    keyboardEl.innerHTML = "";
    KEY_LAYOUT.forEach(keys => {
      const rowEl = document.createElement("div");
      rowEl.className = "krow";
      (Array.isArray(keys) ? keys : [...keys]).forEach(k => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.key = k;
        b.className = "key" + (k.length > 1 ? " wide" : "");
        b.textContent = k === "back" ? "⌫" : k;
        b.setAttribute("aria-label", k === "back" ? "Backspace" : k);
        b.addEventListener("click", () => handleKey(k));
        rowEl.appendChild(b);
      });
      keyboardEl.appendChild(rowEl);
    });
  }

  /* ---------- hints ---------- */
  function buildHints() {
    hints = [];
    hintSlots = [];
    hintSlotsEl.innerHTML = "";
    for (let i = 0; i < COLS; i++) {
      const d = document.createElement("div");
      d.className = "slot";
      hintSlotsEl.appendChild(d);
      hintSlots.push(d);
    }
    updateHintButton();
  }

  function updateHintButton() {
    const left = MAX_HINTS - hints.length;
    hintLabel.textContent = left > 0 ? `Hint (${left})` : "No hints left";
    hintBtn.disabled = left <= 0 || over || busy || !answer;
  }

  function useHint() {
    if (over || busy || !answer || hints.length >= MAX_HINTS) return;
    // Skip letters already revealed or already found in the right place.
    const known = new Set(hints);
    guesses.forEach(g => { for (let i = 0; i < COLS; i++) if (g[i] === answer[i]) known.add(i); });
    const options = [...Array(COLS).keys()].filter(i => !known.has(i));
    if (!options.length) { toast("You already know every letter's place"); return; }
    const i = options[Math.floor(Math.random() * options.length)];
    hints.push(i);
    hintSlots[i].textContent = answer[i];
    hintSlots[i].classList.add("revealed");
    updateHintButton();
  }

  hintBtn.addEventListener("click", () => { useHint(); hintBtn.blur(); });

  // Small helper: fetch JSON with a timeout so a slow service can't hang the game.
  async function getJSON(url, ms = 7000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      return { status: res.status, ok: res.ok, data: res.ok ? await res.json() : null };
    } finally {
      clearTimeout(timer);
    }
  }

  // Last-resort word source, used only if every online word service is unreachable.
  // (Meanings and guess checks still come from online dictionaries.)
  const BACKUP_WORDS = ("about above actor admit adult after again agree ahead alarm album alone along "
    + "amount angry apple april arrow aside audio avoid awake award aware baker basic beach begin being "
    + "below bench birth black blade blame blank blind block blood board boost brain brand brave bread "
    + "break brick brief bring broad brown brush build bunch cabin candy carry catch cause chain chair "
    + "chalk charm chart cheap check chest chief child clean clear climb clock close cloud coach coast "
    + "count court cover craft crash crazy cream cross crowd crown daily dance dealt death delay depth "
    + "dozen draft drama dream dress drink drive eager early earth eight elite empty enemy enjoy enter "
    + "equal error event every exact exist extra faith false fancy fault feast fence field fifth fifty "
    + "fight final first flame flash fleet float floor focus force frame fresh front fruit funny giant "
    + "given glass globe glory grace grade grain grand grape grass great green group guard guess guest "
    + "guide happy heart heavy honey horse hotel house human humor ideal image index inner issue ivory "
    + "jelly joint judge juice knife known label large laser later laugh layer learn least leave legal "
    + "lemon level light limit local logic loose lucky lunch magic major maker march match maybe mayor "
    + "media metal might minor mixed model money month moral motor mount mouse mouth movie music naive "
    + "nerve never newly night noble noise north novel nurse ocean offer often olive onion order other "
    + "outer owner paint panel paper party peace pearl phase phone photo piano pilot pitch place plain "
    + "plane plant plate point pound power press price pride prime print prize proof proud queen quick "
    + "quiet quite radio raise range rapid ratio reach ready river robot rough round route royal rural "
    + "salad scale scene scope score sense serve seven shade shake shape share sharp sheep sheet shelf "
    + "shell shift shine shirt shock shoot short sight silly since sixth skill sleep slice small smart "
    + "smile smoke snake solid solve sound south space spare speak speed spend spice split spoke sport "
    + "staff stage stair stamp stand start state steak steam steel stick still stone store storm story "
    + "strip study style sugar sunny super sweet table taste teach thank their theme there thick thing "
    + "think third those three throw tiger tight title today tooth topic total touch tower track trade "
    + "trail train treat trend trial tribe trick truck truly trust truth twice uncle under union unity "
    + "until upper urban usual valid value video virus visit vital voice waste watch water wheel where "
    + "which while white whole whose woman world worry worth would write wrong young youth zebra").split(" ");

  async function loadPool() {
    if (wordPool && wordPool.length) return wordPool;

    // Source 1: Datamuse (common 5-letter words)
    try {
      const { ok, data } = await getJSON("https://api.datamuse.com/words?sp=?????&md=f&max=1000");
      if (ok) {
        const five = data.filter(d => /^[a-z]{5}$/.test(d.word));
        const common = five.filter(d => {
          const f = (d.tags || []).find(t => t.startsWith("f:"));
          return f && parseFloat(f.slice(2)) >= 3;
        });
        const list = (common.length >= 50 ? common : five).map(d => d.word);
        if (list.length >= 20) return (wordPool = list);
      }
    } catch (err) {
      console.warn("Datamuse word list failed:", err);
    }

    // Source 2: random-word-api
    try {
      const { ok, data } = await getJSON("https://random-word-api.herokuapp.com/word?length=5&number=200");
      if (ok) {
        const list = data.filter(w => /^[a-z]{5}$/.test(w));
        if (list.length >= 20) return (wordPool = list);
      }
    } catch (err) {
      console.warn("random-word-api failed:", err);
    }

    // Source 3: built-in backup so the game can always start
    console.warn("Using built-in backup words.");
    return BACKUP_WORDS;
  }

  const POS_NAMES = { n: "noun", v: "verb", adj: "adjective", adv: "adverb" };

  async function definitionFromDictionaryApi(word) {
    const { ok, data } = await getJSON("https://api.dictionaryapi.dev/api/v2/entries/en/" + word);
    if (!ok) return null;
    const items = [];
    for (const entry of data) {
      for (const m of entry.meanings || []) {
        const d = m.definitions && m.definitions[0];
        if (d) items.push({ pos: m.partOfSpeech, text: d.definition });
      }
    }
    return items.length ? items : null;
  }

  // Backup source in case the first dictionary is slow or down.
  async function definitionFromDatamuse(word) {
    const { ok, data } = await getJSON("https://api.datamuse.com/words?sp=" + word + "&md=d&max=1");
    if (!ok || !data[0] || data[0].word !== word || !data[0].defs) return null;
    const items = data[0].defs.map(line => {
      const [tag, text] = line.split("\t");
      return { pos: POS_NAMES[tag] || "", text: text ? text.charAt(0).toUpperCase() + text.slice(1) : "" };
    }).filter(it => it.text);
    return items.length ? items : null;
  }

  async function fetchDefinition(word) {
    if (defCache.has(word)) return defCache.get(word);
    let items = null;
    try { items = await definitionFromDictionaryApi(word); }
    catch (err) { console.warn("Dictionary service failed:", err); }
    if (!items) {
      try { items = await definitionFromDatamuse(word); }
      catch (err) { console.warn("Backup dictionary failed:", err); }
    }
    if (items) defCache.set(word, items); // only cache successes
    return items;
  }

  async function pickWord() {
    const pool = await loadPool();
    // Prefer a word we already know has a meaning.
    for (let round = 0; round < 3; round++) {
      const batch = [];
      while (batch.length < 3) {
        const w = pool[Math.floor(Math.random() * pool.length)];
        if (!batch.includes(w)) batch.push(w);
      }
      const found = await Promise.all(batch.map(async w => (await fetchDefinition(w)) ? w : null));
      const good = found.find(Boolean);
      if (good) return good;
    }
    // Dictionary slow or unreachable right now: still start the game.
    // The meaning is looked up (with a retry button) when the game ends.
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function newGame() {
    row = 0; col = 0; guesses = []; over = false; busy = true; keyState = {};
    modalEl.classList.add("hidden");
    answer = null;
    buildBoard();
    buildKeyboard();
    buildHints();
    toast("Picking a random word…");
    answer = await pickWord();
    busy = false;
    updateHintButton();
    toastEl.classList.remove("show");
  }

  /* ---------- input ---------- */
  function handleKey(k) {
    if (over || busy) return;
    if (k === "enter") return submit();
    if (k === "back") {
      if (col > 0) {
        col--;
        const t = tiles[row][col];
        t.textContent = "";
        t.classList.remove("filled");
      }
      return;
    }
    if (/^[a-z]$/.test(k) && col < COLS) {
      const t = tiles[row][col];
      t.textContent = k;
      t.classList.add("filled");
      col++;
    }
  }

  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!modalEl.classList.contains("hidden")) {
      if (e.key === "Enter") newGame();
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); handleKey("enter"); }
    else if (e.key === "Backspace") handleKey("back");
    else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toLowerCase());
  });

  /* ---------- word validation ---------- */
  async function isRealWord(word) {
    if (wordPool && wordPool.includes(word)) return true;
    if (validCache.has(word)) return validCache.get(word);
    try {
      const { status, ok } = await getJSON("https://api.dictionaryapi.dev/api/v2/entries/en/" + word);
      if (ok) { validCache.set(word, true); return true; }
      if (status === 404) { validCache.set(word, false); return false; }
    } catch (err) {
      console.warn("Dictionary service failed:", err);
    }
    // Backup check with the word service.
    try {
      const { ok, data } = await getJSON("https://api.datamuse.com/words?sp=" + word + "&max=1");
      if (ok) {
        const valid = !!(data[0] && data[0].word === word);
        validCache.set(word, valid);
        return valid;
      }
    } catch (err) {
      console.warn("Backup word check failed:", err);
    }
    return true; // services unreachable: do not punish the player, accept the guess
  }

  /* ---------- game logic ---------- */
  async function submit() {
    if (col < COLS) { shake("Not enough letters"); return; }
    const guess = tiles[row].map(t => t.textContent).join("");

    busy = true;
    updateHintButton();
    const ok = await isRealWord(guess);
    if (!ok) { busy = false; updateHintButton(); shake("Not in word list"); return; }

    const result = evaluate(guess, answer);
    await reveal(row, guess, result);
    guesses.push(guess);

    if (guess === answer) {
      over = true;
      tiles[row].forEach((t, i) => t.style.setProperty("--i", i));
      boardEl.children[row].classList.add("win");
      setTimeout(() => showResult(true), 900);
    } else if (row === ROWS - 1) {
      over = true;
      setTimeout(() => showResult(false), 500);
    } else {
      row++; col = 0;
    }
    busy = false;
    updateHintButton();
  }

  // Handles repeated letters correctly.
  function evaluate(guess, target) {
    const res = Array(COLS).fill("absent");
    const left = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === target[i]) res[i] = "correct";
      else left[target[i]] = (left[target[i]] || 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
      if (res[i] === "correct") continue;
      if (left[guess[i]] > 0) { res[i] = "present"; left[guess[i]]--; }
    }
    return res;
  }

  function reveal(r, guess, result) {
    return new Promise(resolve => {
      tiles[r].forEach((t, i) => {
        setTimeout(() => {
          t.classList.add("flip");
          setTimeout(() => t.classList.add(result[i]), 250);
        }, i * 280);
      });
      setTimeout(() => {
        updateKeyboard(guess, result);
        resolve();
      }, COLS * 280 + 300);
    });
  }

  function updateKeyboard(guess, result) {
    const rank = { absent: 1, present: 2, correct: 3 };
    [...guess].forEach((ch, i) => {
      if (!keyState[ch] || rank[result[i]] > rank[keyState[ch]]) keyState[ch] = result[i];
      const btn = keyboardEl.querySelector(`[data-key="${ch}"]`);
      btn.classList.remove("absent", "present", "correct");
      btn.classList.add(keyState[ch]);
    });
  }

  /* ---------- feedback ---------- */
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1400);
  }

  function shake(msg) {
    toast(msg);
    const rowEl = boardEl.children[row];
    rowEl.classList.remove("shake");
    void rowEl.offsetWidth;
    rowEl.classList.add("shake");
  }

  async function showResult(won) {
    const card = document.getElementById("modal-card");
    card.classList.remove("win", "lose");
    card.classList.add(won ? "win" : "lose");
    document.getElementById("result-badge").textContent = won ? "🎉" : "😔";
    document.getElementById("result-title").textContent =
      won ? `You won in ${guesses.length} ${guesses.length === 1 ? "try" : "tries"}!` : "You lost. The word was";
    document.getElementById("result-word").textContent = answer;
    const posEl = document.getElementById("result-pos");
    const meaningEl = document.getElementById("result-meaning");
    posEl.textContent = "";
    meaningEl.textContent = "Looking up the meaning…";
    modalEl.classList.remove("hidden");
    document.getElementById("play-again").focus();

    loadMeaning(answer, posEl, meaningEl);
  }

  async function loadMeaning(word, posEl, meaningEl) {
    posEl.textContent = "";
    meaningEl.textContent = "Looking up the meaning…";
    const items = await fetchDefinition(word);
    if (word !== answer) return; // a new game started meanwhile
    if (!items) {
      meaningEl.textContent = "Couldn't reach the dictionary just now. ";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "retry";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => loadMeaning(word, posEl, meaningEl));
      meaningEl.appendChild(retry);
      return;
    }
    posEl.textContent = items[0].pos;
    meaningEl.innerHTML = "";
    items.slice(0, 2).forEach((it, i) => {
      const p = document.createElement("p");
      p.style.margin = i ? "10px 0 0" : "0";
      p.textContent = (i ? `(${it.pos}) ` : "") + it.text;
      meaningEl.appendChild(p);
    });
  }

  document.getElementById("play-again").addEventListener("click", newGame);
  document.getElementById("new-game").addEventListener("click", e => { e.currentTarget.blur(); newGame(); });

  newGame();
})();
