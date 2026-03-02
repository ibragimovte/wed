(() => {
  const DESIGN_WIDTH = 390;

  const stage = document.getElementById("stage");
  const intro = document.getElementById("intro");
  const landing = document.getElementById("landing");
  const envelopeButton = document.getElementById("envelopeButton");

  if (!stage || !intro || !landing || !envelopeButton) return;

  function getMaxPhoneWidth() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--max-phone-width").trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 430;
  }

  function applyStageScale() {
    const maxPhoneWidth = getMaxPhoneWidth();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || DESIGN_WIDTH;
    const boundedWidth = Math.min(viewportWidth, maxPhoneWidth);
    const scale = boundedWidth / DESIGN_WIDTH;
    const offsetX = Math.max(0, (viewportWidth - boundedWidth) / 2);

    document.documentElement.style.setProperty("--stage-scale", String(scale));
    document.documentElement.style.setProperty("--stage-offset-x", `${offsetX}px`);

    // transformed stage does not contribute to layout height
    const stageHeight = stage.scrollHeight;
    document.body.style.minHeight = `${Math.ceil(stageHeight * scale)}px`;
  }

  let isAnimating = false;

  applyStageScale();
  window.addEventListener("resize", applyStageScale);
  window.addEventListener("load", applyStageScale);

  envelopeButton.addEventListener("click", () => {
    if (isAnimating) return;
    isAnimating = true;

    envelopeButton.classList.add("is-open");

    window.setTimeout(() => {
      intro.classList.add("is-fading");
      landing.classList.add("screen--active");

      window.requestAnimationFrame(() => {
        landing.classList.add("is-visible");
      });

      window.setTimeout(() => {
        intro.classList.remove("screen--active");
        applyStageScale();
        window.scrollTo({ top: 0, behavior: "auto" });
      }, 470);
    }, 620);
  });
})();
