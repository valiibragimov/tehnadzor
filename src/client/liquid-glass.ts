(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    return;
  }

  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!supportsHover) {
    return;
  }

  const buttons = document.querySelectorAll(".lg-btn");
  if (!buttons.length) {
    return;
  }

  const maxTilt = 6;
  const maxGlow = 18;

  const resetButton = (button) => {
    button.style.setProperty("--lg-tilt-x", "0deg");
    button.style.setProperty("--lg-tilt-y", "0deg");
    button.style.setProperty("--lg-glow-x", "0px");
    button.style.setProperty("--lg-glow-y", "0px");
  };

  const handleMove = (button, event) => {
    if (event.pointerType === "touch") {
      return;
    }

    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const relX = (event.clientX - rect.left) / rect.width - 0.5;
    const relY = (event.clientY - rect.top) / rect.height - 0.5;
    const tiltX = (-relY * maxTilt).toFixed(2);
    const tiltY = (relX * maxTilt).toFixed(2);

    button.style.setProperty("--lg-tilt-x", `${tiltX}deg`);
    button.style.setProperty("--lg-tilt-y", `${tiltY}deg`);
    button.style.setProperty("--lg-glow-x", `${(relX * maxGlow).toFixed(2)}px`);
    button.style.setProperty("--lg-glow-y", `${(relY * maxGlow).toFixed(2)}px`);
  };

  buttons.forEach((button) => {
    button.addEventListener("pointermove", (event) => handleMove(button, event));
    button.addEventListener("pointerleave", () => resetButton(button));
    button.addEventListener("pointercancel", () => resetButton(button));
  });
})();
