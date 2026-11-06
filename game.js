// ============================================================
// «Дожить до рассвета в Суздале» — игровая логика
// ============================================================

const ROUNDS = 10;      // квартир за ночь
const LIVES = 5;        // жизней на раунд
const POINTS_RIGHT = 100;
const POINTS_PER_LIFE = 20; // бонус за каждую оставшуюся жизнь

const $ = (id) => document.getElementById(id);

// ---------- Утилиты ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const fmtRub = (n) => n.toLocaleString("ru-RU") + " ₽";

// русская плюрализация: pluralRu(2, "раз", "раза", "раз") → "раза"
function pluralRu(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---------- Пиксельные сердечки ----------
const HEART_MAP = [
  "..XX...XX..",
  ".XXXX.XXXX.",
  "XXXXXXXXXXX",
  "XXXXXXXXXXX",
  "XXXXXXXXXXX",
  ".XXXXXXXXX.",
  "..XXXXXXX..",
  "...XXXXX...",
  "....XXX....",
  ".....X....."
];

function heartSVG() {
  let rects = "";
  HEART_MAP.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "X") rects += `<rect x="${x}" y="${y}" width="1.05" height="1.05"/>`;
    }
  });
  return `<svg viewBox="-0.3 -0.3 12 11" aria-hidden="true"><g fill="#c9453f">${rects}</g></svg>`;
}

function renderHearts(lives) {
  const box = $("hearts");
  box.innerHTML = "";
  for (let i = 0; i < LIVES; i++) {
    const wrap = document.createElement("span");
    wrap.innerHTML = heartSVG();
    const svg = wrap.firstChild;
    if (i >= lives) svg.classList.add("heart-lost");
    box.appendChild(svg);
  }
}

// ---------- Экраны ----------
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  $(id).scrollTop = 0;
}

// ---------- Генерация вариантов цены ----------
// Настоящая цена + два фейковых. Паттерн меняется случайно, чтобы
// реальную цену нельзя было вычислить как «среднюю»:
//   A: один фейк ниже, один выше → настоящая посередине
//   B: оба фейка выше            → настоящая — самая низкая
//   C: оба фейка ниже            → настоящая — самая высокая
function buildOptions(real) {
  const round10 = (v) => Math.max(500, Math.round(v / 10) * 10);
  const r = Math.random();
  let f1, f2;
  if (r < 0.34) {            // A — по обе стороны
    f1 = 0.80 + Math.random() * 0.10;    // −20%…−10%
    f2 = 1.10 + Math.random() * 0.10;    // +10%…+20%
  } else if (r < 0.67) {     // B — обе завышены
    f1 = 1.08 + Math.random() * 0.07;    // +8%…+15%
    f2 = 1.22 + Math.random() * 0.18;    // +22%…+40%
  } else {                   // C — обе занижены
    f1 = 0.86 + Math.random() * 0.07;    // −14%…−7%
    f2 = 0.65 + Math.random() * 0.13;    // −35%…−22%
  }
  const opts = shuffle([
    { value: real, correct: true },
    { value: round10(real * f1), correct: false },
    { value: round10(real * f2), correct: false }
  ]);
  // защита от совпадений после округления (правильный ответ не трогаем)
  const seen = new Set([real]);
  opts.forEach(o => {
    while (!o.correct && seen.has(o.value)) o.value += 10;
    seen.add(o.value);
  });
  return opts;
}

// ---------- Состояние ----------
let state = null;

function newGame() {
  const order = shuffle(APARTMENTS).slice(0, ROUNDS);
  state = {
    order,
    idx: 0,
    lives: LIVES,
    score: 0,
    overpay: 0,        // сумма переплаты
    overpaySaved: 0,   // сумма "сэкономленного" (занижения)
    correct: 0,
    overCount: 0,      // завышенных ошибок
    underCount: 0,     // заниженных ошибок
    selected: null,
    resolved: false
  };
  $("hud-score").textContent = "0";
  renderHearts(state.lives);
  renderRound();
  show("screen-game");
}

// ---------- Раунд ----------
function renderRound() {
  const apt = state.order[state.idx];
  state.selected = null;
  state.resolved = false;

  // прогресс
  $("progress-label").textContent = (state.idx + 1) + " / " + ROUNDS;
  $("progress-fill").style.width = ((state.idx / ROUNDS) * 100) + "%";

  // галерея
  const gal = $("gallery");
  gal.innerHTML = "";
  apt.images.forEach(src => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = apt.title;
    img.loading = "eager";
    img.draggable = false;
    gal.appendChild(img);
  });
  gal.scrollLeft = 0;

  // точки
  const dots = $("gal-dots");
  dots.innerHTML = "";
  apt.images.forEach(() => dots.appendChild(document.createElement("i")));
  updateDots();

  // инфо
  $("apt-title").textContent = apt.title;
  $("apt-address").textContent = apt.address || "Суздаль, адрес скрыт";

  // варианты цены
  const options = buildOptions(apt.price);
  const box = $("price-options");
  box.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "price-opt";
    btn.textContent = fmtRub(opt.value);
    btn.dataset.value = opt.value;
    btn.addEventListener("click", () => selectPrice(btn));
    box.appendChild(btn);
  });

  // сброс вердикта и кнопок
  $("verdict-box").classList.add("hidden");
  $("btn-rate").classList.remove("hidden");
  $("btn-rate").disabled = true;
  $("btn-next").classList.add("hidden");

  // предзагрузка следующей квартиры (чтобы не тормозило)
  const next = state.order[state.idx + 1];
  if (next) next.images.forEach(src => { const im = new Image(); im.src = src; });
}

function updateDots() {
  const gal = $("gallery");
  const per = gal.scrollWidth / state.order[state.idx].images.length;
  const page = Math.min(
    state.order[state.idx].images.length - 1,
    Math.round(gal.scrollLeft / per)
  );
  [...$("gal-dots").children].forEach((d, i) => d.classList.toggle("on", i === page));
}

function selectPrice(btn) {
  if (state.resolved) return;
  state.selected = Number(btn.dataset.value);
  document.querySelectorAll(".price-opt").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  $("btn-rate").disabled = false;
}

// ---------- Оценка ----------
function resolveAnswer() {
  if (state.resolved || state.selected === null) return;
  state.resolved = true;

  const apt = state.order[state.idx];
  const chosen = state.selected;
  const real = apt.price;
  const right = chosen === real;

  document.querySelectorAll(".price-opt").forEach(b => {
    const v = Number(b.dataset.value);
    b.classList.add("locked");
    if (v === real) b.classList.add("right");
    else if (v === chosen) b.classList.add("wrong");
  });

  const line = $("verdict-line");
  const realLine = $("verdict-real");

  if (right) {
    state.correct++;
    state.score += POINTS_RIGHT;
    line.textContent = "Дверь открылась. Вы знаете цену вещам.";
    line.className = "verdict-line ok";
    realLine.textContent = "Настоящая цена: " + fmtRub(real) + "  •  +" + POINTS_RIGHT + " очков";
  } else {
    state.lives--;
    renderHearts(state.lives);
    if (chosen > real) {
      state.overCount++;
      const delta = chosen - real;
      state.overpay += delta;
      line.textContent = "Вы переплатили. Хозяин молча улыбнулся.";
      realLine.textContent = "Настоящая цена: " + fmtRub(real) +
        "  •  переплата " + fmtRub(delta) + "  •  −1 жизнь";
    } else {
      state.underCount++;
      const delta = real - chosen;
      state.overpaySaved += delta;
      line.textContent = "Слишком мало. За дверью никого не было.";
      realLine.textContent = "Настоящая цена: " + fmtRub(real) +
        "  •  вы назвали меньше на " + fmtRub(delta) + "  •  −1 жизнь";
    }
    line.className = "verdict-line bad";
  }

  $("hud-score").textContent = state.score;
  $("verdict-box").classList.remove("hidden");
  $("btn-rate").classList.add("hidden");
  $("btn-next").classList.remove("hidden");
}

// ---------- Переход ----------
function advance() {
  if (state.lives <= 0) {
    $("gameover-score").textContent = "верных оценок: " + state.correct + " из " + (state.idx + 1);
    show("screen-gameover");
    return;
  }
  if (state.idx + 1 >= ROUNDS) {
    finishGame();
    return;
  }
  state.idx++;
  renderRound();
  $("screen-game").scrollTop = 0;
}

// ---------- Итоги ----------
function finishGame() {
  const bonus = state.lives * POINTS_PER_LIFE;
  const total = state.score + bonus;

  $("r-passed").textContent = ROUNDS + "/" + ROUNDS;
  $("r-correct").textContent = state.correct;
  $("r-lives").textContent = state.lives;
  $("r-bonus").textContent = "+" + bonus;
  $("r-overpay").textContent = fmtRub(state.overpay);
  $("r-score").textContent = total;

  const lead = $("result-lead");
  const tag = $("r-tag");
  const text = $("r-text");

  if (state.correct === ROUNDS) {
    lead.textContent = "Тысячелетний город склонился перед вами.";
    tag.textContent = "ХОЗЯИН СУЗДАЛЯ";
    text.textContent = "Ни одной ошибки. Вы знали цену каждой двери — и все двери знали вас. Горожане шепчутся: этот человек помнит цены лучше, чем сам Суздаль. Считайте этот город своим. Если решите остаться.";
  } else if (state.overCount > state.underCount && state.overCount >= 2) {
    lead.textContent = "Кошелёк истончился, но вы дожили до рассвета.";
    tag.textContent = "ПЛАТЁЖЕСПОСОБНЫЙ МИЛЛЕНИАЛ";
    text.textContent = "Вы чуть не остались на улице: переплатили в " + state.overCount +
      " дверях на общую сумму " + fmtRub(state.overpay) + ". Но горожане поняли, что вы готовы платить, — и приютили. " +
      "Вы платёжеспособный миллениал, и Суздаль вас принял. Осторожно: город уже прикидывает, где бы взять с вас ещё.";
  } else if (state.underCount > state.overCount && state.underCount >= 2) {
    lead.textContent = "Двери закрывались одна за другой.";
    tag.textContent = "НЕПЛАТЁЖЕСПОСОБНЫЙ ЗУМЕР";
    text.textContent = "Вы занижали цену " + state.underCount + " " +
      pluralRu(state.underCount, "раз", "раза", "раз") +
      ". Хозяева делали вид, что не слышат. Неплатёжеспособный зумер: ночуйте на улице, " +
      "и если доживёте до рассвета — найдите себе город помолодежнее.";
  } else {
    lead.textContent = "Ночь прошла на грани.";
    tag.textContent = "НОЧНОЙ ГОСТЬ";
    text.textContent = "Суздаль так и не понял, кто вы: то ли щедрый, то ли жадный, то ли просто испуганный турист. " +
      "Двери закрылись за вами ровно тогда, когда рассвет уже начал тлеть над куполами. До следующей ночи.";
  }

  show("screen-result");
}

// ---------- Галерея: стрелки ----------
function galleryScroll(dir) {
  const gal = $("gallery");
  gal.scrollBy({ left: dir * gal.clientWidth, behavior: "smooth" });
}

// ---------- Обработчики ----------
$("btn-start").addEventListener("click", () => show("screen-onboarding"));
$("btn-onboard").addEventListener("click", newGame);
$("btn-retry").addEventListener("click", newGame);
$("btn-again").addEventListener("click", newGame);
$("btn-rate").addEventListener("click", resolveAnswer);
$("btn-next").addEventListener("click", advance);
$("gal-prev").addEventListener("click", () => galleryScroll(-1));
$("gal-next").addEventListener("click", () => galleryScroll(1));
$("gallery").addEventListener("scroll", updateDots, { passive: true });
