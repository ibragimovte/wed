(() => {
  const STATES = {
    INTRO_INITIAL: "intro-initial",
    INTRO_TAPPED: "intro-tapped",
    MAIN: "main"
  };

  let currentState = STATES.INTRO_INITIAL;
  let isTransitioning = false;

  function getMsVar(name, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return fallback;
    if (raw.endsWith("ms")) return Number.parseFloat(raw);
    if (raw.endsWith("s")) return Number.parseFloat(raw) * 1000;
    return fallback;
  }

  function setState(next) {
    const intro = document.getElementById("intro");
    currentState = next;

    intro.classList.remove("state-intro-initial", "state-intro-tapped");

    if (next === STATES.INTRO_INITIAL) {
      intro.classList.add("state-intro-initial");
      return;
    }

    if (next === STATES.INTRO_TAPPED) {
      intro.classList.add("state-intro-tapped");
    }
  }

  function moveToMain() {
    const intro = document.getElementById("intro");
    const main = document.getElementById("main");
    const fadeMs = getMsVar("--fade-duration", 380);

    intro.classList.add("is-fading");
    main.classList.add("is-visible");
    document.body.classList.remove("no-scroll");
    currentState = STATES.MAIN;

    window.setTimeout(() => {
      intro.hidden = true;
      isTransitioning = false;
    }, fadeMs + 40);
  }

  function startOpenFlow() {
    if (isTransitioning || currentState !== STATES.INTRO_INITIAL) return;
    isTransitioning = true;

    const introAnimMs = getMsVar("--intro-anim-duration", 520);
    const delayAfterTapMs = 150;

    setState(STATES.INTRO_TAPPED);

    window.setTimeout(() => {
      moveToMain();
    }, introAnimMs + delayAfterTapMs);
  }

  function initInvitation() {
    const hitArea = document.getElementById("envelope-hitarea");
    const rsvpButton = document.getElementById("rsvp-button");

    if (!hitArea) return;

    setState(STATES.INTRO_INITIAL);

    hitArea.addEventListener("click", startOpenFlow, { once: false });
    hitArea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        startOpenFlow();
      }
    });

    if (rsvpButton) {
      rsvpButton.addEventListener("click", () => {
        alert("Анкета будет подключена позже. Спасибо!");
      });
    }
  }

  window.initInvitation = initInvitation;
  window.addEventListener("DOMContentLoaded", initInvitation);
})();
