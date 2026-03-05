(() => {
  const DESIGN_WIDTH = 390;

  const stage = document.getElementById("stage");
  const intro = document.getElementById("intro");
  const landing = document.getElementById("landing");
  const landingBox = landing ? landing.querySelector(".landing-box") : null;
  const envelopeButton = document.getElementById("envelopeButton");
  const introTitle = intro ? intro.querySelector(".intro-title") : null;
  const surveyForm = document.getElementById("guest-survey");
  const surveyStatus = document.getElementById("survey-status");
  const submitButton = surveyForm ? surveyForm.querySelector(".survey-form__submit") : null;
  const submitText = surveyForm ? surveyForm.querySelector(".survey-form__submit-text") : null;

  if (!stage || !intro || !landing || !landingBox || !envelopeButton) return;

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

    let maxBottom = 0;
    for (const child of landingBox.children) {
      const bottom = child.offsetTop + child.offsetHeight;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    landingBox.style.minHeight = `${Math.max(844, Math.ceil(maxBottom + 40))}px`;

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

    if (introTitle) {
      introTitle.classList.add("is-fading");
    }

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

  if (surveyForm && submitButton && submitText && surveyStatus) {
    surveyForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(surveyForm);
      const cfTokenInput = surveyForm.querySelector('input[name="cf-turnstile-response"]');
      const cfToken = cfTokenInput ? String(cfTokenInput.value ?? "").trim() : "";
      const payload = {
        name: String(formData.get("name") ?? "").trim(),
        attendance: String(formData.get("attendance") ?? "").trim(),
        hot: String(formData.get("hot") ?? "").trim(),
        turnstileToken: String(formData.get("turnstileToken") ?? "").trim() || cfToken,
      };

      if (!payload.name || !payload.attendance || !payload.hot) {
        surveyStatus.textContent = "Заполните все обязательные поля.";
        surveyStatus.classList.remove("survey-form__status--success");
        surveyStatus.classList.add("survey-form__status--error");
        return;
      }

      setSubmitting(true);
      surveyStatus.textContent = "";
      surveyStatus.classList.remove("survey-form__status--success", "survey-form__status--error");

      try {
        const response = await fetch("/api/rsvp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data?.ok) {
          throw new Error("Bad response");
        }

        surveyStatus.textContent = "Спасибо, мы получили ответ.";
        surveyStatus.classList.add("survey-form__status--success");
        surveyForm.reset();
      } catch {
        surveyStatus.textContent = "Не удалось отправить, попробуйте еще раз.";
        surveyStatus.classList.add("survey-form__status--error");
      } finally {
        setSubmitting(false);
      }
    });
  }

  function setSubmitting(isSubmitting) {
    if (!submitButton || !submitText) return;
    submitButton.disabled = isSubmitting;
    submitButton.classList.toggle("is-loading", isSubmitting);
    submitText.textContent = isSubmitting ? "Отправляем..." : "Отправить";
  }
})();
