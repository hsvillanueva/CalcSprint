(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const views = {
    menu: $("#menu"),
    game: $("#game"),
    answer: $("#answerScreen"),
    results: $("#results"),
  };

  const settingsForm = $("#settingsForm");
  const answerForm = $("#answerForm");
  const homeBtn = $("#homeBtn");
  const speedInput = $("#speed");
  const speedVal = $("#speedVal");
  const rangeInput = $("#range");
  const countInput = $("#count");
  const accountancyInput = $("#accountancy");
  const formError = $("#formError");
  const countdownEl = $("#countdown");
  const flashArea = $("#flashArea");
  const progressText = $("#progressText");
  const answerInput = $("#answer");
  const answerHint = $("#answerHint");
  const restartBtn = $("#restart");
  const skipBtn = $("#skip");
  const toMenuBtn = $("#toMenu");
  const resultBanner = $(".result-banner");
  const resultTitle = $("#resultTitle");
  const submittedAnswerEl = $("#submittedAnswer");
  const correctTotalEl = $("#correctTotal");

  const ACCOUNTANCY = {
    min: 10000,
    max: 9999750,
    endings: [0, 250, 500, 750],
  };

  const COUNTDOWN_STEPS = ["Ready", "Set", "Go"];
  const state = {
    settings: null,
    sequence: [],
    timers: [],
    running: false,
  };

  function showView(name) {
    Object.entries(views).forEach(([key, view]) => {
      view.classList.toggle("hidden", key !== name);
    });
    document.body.dataset.view = name;
    // hide home button while on the menu/settings screen
    if (homeBtn) {
      homeBtn.style.display = name === "menu" ? "none" : "";
    }
  }

  function setTimer(callback, delay) {
    const timer = window.setTimeout(callback, delay);
    state.timers.push(timer);
    return timer;
  }

  function clearTimers() {
    state.timers.forEach((timer) => window.clearTimeout(timer));
    state.timers = [];
    state.running = false;
  }

  function formatSeconds(milliseconds) {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  }

  function formatNumber(number) {
    return Number(number).toLocaleString("en-US");
  }

  function parseNumber(value) {
    const cleaned = String(value).replace(/[,\s]/g, "");
    if (!/^-?\d+$/.test(cleaned)) {
      return NaN;
    }
    return Number.parseInt(cleaned, 10);
  }

  function parseRange(value) {
    const parts = String(value)
      .trim()
      .replace(/[,\s]/g, "")
      .match(/^(\d+)-(\d+)$/);

    if (!parts) {
      throw new Error("Use a range like 100000-1000000.");
    }

    let min = Number.parseInt(parts[1], 10);
    let max = Number.parseInt(parts[2], 10);

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error("Use whole numbers for the range.");
    }

    if (min > max) {
      [min, max] = [max, min];
    }

    if (min < 0) {
      throw new Error("Use a range of zero or higher.");
    }

    if (min === 0 && max === 0) {
      throw new Error("Use a range with at least one positive number.");
    }

    return { min, max };
  }

  function getMode() {
    return $("input[name='mode']:checked").value;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function snapToAccountancy(value, direction) {
    const clamped = Math.min(Math.max(value, ACCOUNTANCY.min), ACCOUNTANCY.max);
    const thousands = Math.floor(clamped / 1000);
    const ending = clamped % 1000;

    if (direction === "down") {
      for (let i = ACCOUNTANCY.endings.length - 1; i >= 0; i -= 1) {
        if (ACCOUNTANCY.endings[i] <= ending) {
          return thousands * 1000 + ACCOUNTANCY.endings[i];
        }
      }
      return Math.max(ACCOUNTANCY.min, (thousands - 1) * 1000 + 750);
    }

    for (const accountancyEnding of ACCOUNTANCY.endings) {
      if (accountancyEnding >= ending) {
        return thousands * 1000 + accountancyEnding;
      }
    }

    return Math.min(ACCOUNTANCY.max, (thousands + 1) * 1000);
  }

  function randomAccountancyNumber(min = ACCOUNTANCY.min, max = ACCOUNTANCY.max) {
    const low = snapToAccountancy(min, "up");
    const high = snapToAccountancy(max, "down");

    if (low > high) {
      return null;
    }

    const lowStep = Math.ceil((low - ACCOUNTANCY.min) / 250);
    const highStep = Math.floor((high - ACCOUNTANCY.min) / 250);
    const step = randInt(lowStep, highStep);
    return ACCOUNTANCY.min + step * 250;
  }

  function randomNumber(settings, minOverride, maxOverride) {
    if (settings.accountancy) {
      return randomAccountancyNumber(
        minOverride ?? ACCOUNTANCY.min,
        maxOverride ?? ACCOUNTANCY.max
      );
    }

    const min = Math.max(0, minOverride ?? settings.range.min);
    const max = Math.max(0, maxOverride ?? settings.range.max);

    if (min > max) {
      return null;
    }

    return randInt(min, max);
  }

  function getSettings() {
    const count = Number.parseInt(countInput.value, 10);
    const mode = getMode();
    const accountancy = accountancyInput.checked;
    const range = accountancy ? { min: ACCOUNTANCY.min, max: ACCOUNTANCY.max } : parseRange(rangeInput.value);
    const speed = Number.parseInt(speedInput.value, 10);

    if (!Number.isInteger(count) || count < 1 || count > 120) {
      throw new Error("Choose 1 to 120 numbers.");
    }

    return {
      mode,
      accountancy,
      range,
      count,
      speed: Math.min(Math.max(speed, 200), 2000),
    };
  }

  function canMakeSubtractionRound(settings) {
    if (settings.count === 1) {
      return true;
    }

    return settings.range.min * (settings.count - 1) <= settings.range.max;
  }

  function makeAdditionRound(settings) {
    return Array.from({ length: settings.count }, () => ({
      op: "add",
      value: randomNumber(settings),
    }));
  }

  function makeSubtractionRound(settings) {
    if (!canMakeSubtractionRound(settings)) {
      throw new Error("For subtraction mode, use fewer numbers or a wider range so the total can stay non-negative.");
    }

    if (settings.count === 1) {
      return [{ op: "add", value: randomNumber(settings) }];
    }

    const sequence = [];
    const remainingSubs = settings.count - 1;
    const minimumNeeded = settings.range.min * remainingSubs;
    const startMin = Math.max(settings.range.min, minimumNeeded);
    const start = randomNumber(settings, startMin, settings.range.max);

    if (start === null) {
      throw new Error("This subtraction setup cannot stay non-negative. Use fewer numbers or a wider range.");
    }

    sequence.push({ op: "add", value: start });

    let running = start;
    for (let i = 0; i < remainingSubs; i += 1) {
      const slotsAfter = remainingSubs - i - 1;
      const maxForThis = Math.min(settings.range.max, running - settings.range.min * slotsAfter);
      const value = randomNumber(settings, settings.range.min, maxForThis);

      if (value === null) {
        throw new Error("This subtraction setup cannot stay non-negative. Use fewer numbers or a wider range.");
      }

      sequence.push({ op: "sub", value });
      running -= value;
    }

    return sequence;
  }

  function makeMixedRound(settings) {
    const sequence = [];
    let running = 0;
    let subtractionCount = 0;

    for (let i = 0; i < settings.count; i += 1) {
      const value = randomNumber(settings);
      const canSubtract = value <= running;
      const shouldSubtract = i > 0 && canSubtract && Math.random() < 0.48;
      const op = shouldSubtract ? "sub" : "add";

      sequence.push({ op, value });
      running += op === "add" ? value : -value;
      if (op === "sub") {
        subtractionCount += 1;
      }
    }

    if (settings.count > 1 && subtractionCount === 0) {
      let runningBefore = 0;
      for (let i = 0; i < sequence.length; i += 1) {
        const item = sequence[i];
        if (i > 0 && item.value <= runningBefore) {
          item.op = "sub";
          subtractionCount += 1;
          break;
        }
        runningBefore += item.op === "add" ? item.value : -item.value;
      }
    }

    return sequence;
  }

  function validateSequence(sequence, settings) {
    let running = 0;

    for (const item of sequence) {
      if (!Number.isInteger(item.value) || item.value < settings.range.min || item.value > settings.range.max) {
        throw new Error("Could not generate numbers inside the selected range.");
      }

      if (settings.accountancy) {
        const ending = item.value % 1000;
        if (item.value < ACCOUNTANCY.min || item.value > ACCOUNTANCY.max || !ACCOUNTANCY.endings.includes(ending)) {
          throw new Error("Could not generate accountancy mode numbers.");
        }
      }

      running += item.op === "add" ? item.value : -item.value;
      if (running < 0) {
        throw new Error("Could not keep the result non-negative with this setup.");
      }
    }
  }

  function prepareRound() {
    const settings = getSettings();
    let sequence;

    if (settings.mode === "add") {
      sequence = makeAdditionRound(settings);
    } else if (settings.mode === "sub") {
      sequence = makeSubtractionRound(settings);
    } else {
      sequence = makeMixedRound(settings);
    }

    validateSequence(sequence, settings);
    state.settings = settings;
    state.sequence = sequence;
  }

  function totalFor(sequence = state.sequence) {
    return sequence.reduce((sum, item) => sum + (item.op === "add" ? item.value : -item.value), 0);
  }

  function resetFeedback() {
    formError.textContent = "";
    answerHint.textContent = "";
  }

  function runCountdown(index = 0) {
    countdownEl.textContent = COUNTDOWN_STEPS[index];
    flashArea.innerHTML = "";
    progressText.textContent = "";

    if (index >= COUNTDOWN_STEPS.length - 1) {
      setTimer(() => {
        countdownEl.textContent = "";
        flashNumber(0);
      }, 620);
      return;
    }

    setTimer(() => runCountdown(index + 1), 620);
  }

  function flashNumber(index) {
    if (!state.running) {
      return;
    }

    if (index >= state.sequence.length) {
      setTimer(showAnswerScreen, 260);
      return;
    }

    const item = state.sequence[index];
    const node = document.createElement("div");
    node.className = `flash-item ${item.op}`;
    node.textContent = `${item.op === "add" ? "+" : "-"} ${formatNumber(item.value)}`;

    flashArea.replaceChildren(node);
    progressText.textContent = `${index + 1} / ${state.sequence.length}`;
    setTimer(() => flashNumber(index + 1), state.settings.speed);
  }

  function startRound(reuseCurrent = false) {
    clearTimers();
    resetFeedback();

    try {
      if (!reuseCurrent) {
        prepareRound();
      }
    } catch (error) {
      formError.textContent = error.message;
      showView("menu");
      return;
    }

    state.running = true;
    answerInput.value = "";
    showView("game");
    runCountdown();
  }

  function showAnswerScreen() {
    clearTimers();
    showView("answer");
    answerInput.value = "";
    answerInput.focus({ preventScroll: true });
  }

  function showResults(status, submittedValue = null) {
    clearTimers();

    const correctTotal = totalFor();
    const correct = status === "correct";
    const skipped = status === "skipped";

    resultBanner.classList.toggle("correct", correct);
    resultBanner.classList.toggle("wrong", !correct);
    resultTitle.textContent = correct ? "Correct answer" : "Wrong answer";
    submittedAnswerEl.textContent = skipped ? "Skipped" : formatNumber(submittedValue);
    correctTotalEl.textContent = formatNumber(correctTotal);
    showView("results");
  }

  function handleAnswerSubmit(event) {
    event.preventDefault();
    const rawValue = answerInput.value.trim();

    if (!rawValue) {
      answerHint.textContent = "Enter a total or skip to view the result.";
      return;
    }

    const userAnswer = parseNumber(rawValue);
    if (!Number.isInteger(userAnswer)) {
      answerHint.textContent = "Use whole numbers only.";
      return;
    }

    showResults(userAnswer === totalFor() ? "correct" : "wrong", userAnswer);
  }

  function returnHome() {
    clearTimers();
    resetFeedback();
    flashArea.innerHTML = "";
    countdownEl.textContent = "Ready";
    progressText.textContent = "";
    answerInput.value = "";
    showView("menu");
  }

  speedInput.addEventListener("input", () => {
    speedVal.textContent = formatSeconds(Number.parseInt(speedInput.value, 10));
  });

  accountancyInput.addEventListener("change", () => {
    rangeInput.disabled = accountancyInput.checked;
    rangeInput.placeholder = accountancyInput.checked ? "Accountancy mode range" : "100000-1000000";
  });

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    startRound(false);
  });

  answerForm.addEventListener("submit", handleAnswerSubmit);
  restartBtn.addEventListener("click", () => startRound(true));
  skipBtn.addEventListener("click", () => showResults("skipped"));
  toMenuBtn.addEventListener("click", returnHome);
  homeBtn.addEventListener("click", returnHome);

  $$(".segmented-control input").forEach((input) => {
    input.addEventListener("change", () => {
      formError.textContent = "";
    });
  });

  rangeInput.addEventListener("input", () => {
    formError.textContent = "";
  });

  countInput.addEventListener("input", () => {
    formError.textContent = "";
  });

  speedVal.textContent = formatSeconds(Number.parseInt(speedInput.value, 10));
  showView("menu");
})();
