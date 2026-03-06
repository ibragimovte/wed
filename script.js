(() => {
  const DESIGN_WIDTH = 390;

  const stage = document.getElementById("stage");
  const intro = document.getElementById("intro");
  const landing = document.getElementById("landing");
  const landingBox = landing ? landing.querySelector(".landing-box") : null;
  const envelopeButton = document.getElementById("envelopeButton");
  const introTitle = intro ? intro.querySelector(".intro-title") : null;
  const surveyForm = document.getElementById("guest-survey");

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
    const rawScale = boundedWidth / DESIGN_WIDTH;
    const scale = Math.round(rawScale * 1000) / 1000;
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

  function scheduleScale() {
    window.requestAnimationFrame(applyStageScale);
  }

  let isAnimating = false;

  applyStageScale();
  window.requestAnimationFrame(applyStageScale);
  window.setTimeout(applyStageScale, 180);
  window.addEventListener("resize", scheduleScale);
  window.addEventListener("orientationchange", scheduleScale);
  window.addEventListener("load", scheduleScale);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleScale);
  }

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

  if (surveyForm) {
    const submitBtn = surveyForm.querySelector(".survey-form__submit");
    const defaultSubmitText = submitBtn ? submitBtn.textContent : "Отправить";
    const hotInputs = Array.from(surveyForm.querySelectorAll("input[name='hot']"));
    const attendanceInputs = Array.from(surveyForm.querySelectorAll("input[name='attendance']"));

    function setSubmitText(text) {
      if (!submitBtn) return;
      submitBtn.textContent = text;
    }

    function updateHotState() {
      const attendanceInput = surveyForm.querySelector("input[name='attendance']:checked");
      const needsHot = attendanceInput && attendanceInput.value === "yes";

      for (const input of hotInputs) {
        input.disabled = !needsHot;
        if (!needsHot) input.checked = false;
      }
    }

    for (const input of attendanceInputs) {
      input.addEventListener("change", updateHotState);
    }
    updateHotState();

    surveyForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const nameInput = surveyForm.querySelector("#guest-name");
      const attendanceInput = surveyForm.querySelector("input[name='attendance']:checked");
      const hotInput = surveyForm.querySelector("input[name='hot']:checked");
      const needsHot = attendanceInput && attendanceInput.value === "yes";

      const payload = {
        name: nameInput ? nameInput.value.trim() : "",
        attendance: attendanceInput ? attendanceInput.value : "",
        hot: hotInput ? hotInput.value : "",
      };

      if (!payload.name || !payload.attendance || (needsHot && !payload.hot)) {
        setSubmitText("Выберите горячее");
        window.setTimeout(() => setSubmitText(defaultSubmitText), 1500);
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add("is-loading");
      }
      setSubmitText("Отправляем...");

      try {
        const response = await fetch("/api/rsvp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          setSubmitText("Не удалось отправить, попробуйте еще раз");
          return;
        }

        surveyForm.reset();
        updateHotState();
        setSubmitText("Спасибо, мы приняли ваш ответ");
      } catch {
        setSubmitText("Не удалось отправить, попробуйте еще раз");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove("is-loading");
        }
        window.setTimeout(() => setSubmitText(defaultSubmitText), 2500);
      }
    });
  }
})();
