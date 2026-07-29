void import("../ui/theme.js")
  .then(({ initThemeControls }) => {
    initThemeControls();
  })
  .catch(() => {
    // The static privacy content remains readable if theme controls are absent.
  });
