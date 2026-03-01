(() => {
  const intro = document.getElementById("intro");
  const landing = document.getElementById("landing");
  const envelopeButton = document.getElementById("envelopeButton");

  if (!intro || !landing || !envelopeButton) return;

  let isAnimating = false;

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
        window.scrollTo({ top: 0, behavior: "instant" });
      }, 470);
    }, 620);
  });
})();
