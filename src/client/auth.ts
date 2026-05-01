// auth.js
import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  getAdditionalUserInfo
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { showAlert } from "./utils.js";

const PENDING_WELCOME_KEY = "pending_welcome_message";
const PENDING_WELCOME_NEW_USER = "new_user";

function initLoginBrandAnimation() {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    return;
  }

  const product = document.querySelector<HTMLElement>(".auth-card--login .auth-product");
  const description = document.querySelector<HTMLElement>(".auth-card--login .auth-description");
  if (!product || !description) {
    return;
  }

  const animateText = (
    element: HTMLElement,
    finalText: string,
    charDelay: number,
    startDelay = 0
  ) => new Promise<void>((resolve) => {
    element.textContent = "";
    element.classList.add("is-typing");

    window.setTimeout(() => {
      let index = 0;
      const step = () => {
        index += 1;
        element.textContent = finalText.slice(0, index);

        if (index < finalText.length) {
          const currentChar = finalText[index - 1];
          const nextDelay = /[.,!?]/.test(currentChar)
            ? charDelay + 150
            : /\s/.test(currentChar)
              ? charDelay + 35
              : charDelay;
          window.setTimeout(step, nextDelay);
          return;
        }

        element.classList.remove("is-typing");
        resolve();
      };

      step();
    }, startDelay);
  });

  const productText = product.textContent?.trim() ?? "";
  const descriptionText = description.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!productText || !descriptionText) {
    return;
  }

  const reservedDescriptionHeight = Math.ceil(description.getBoundingClientRect().height);
  if (reservedDescriptionHeight > 0) {
    description.style.minHeight = `${reservedDescriptionHeight}px`;
  }

  product.textContent = productText;
  product.classList.remove("is-typing");

  void animateText(description, descriptionText, 30, 260);
}

/**
 * Вешаем обработчики на кнопки входа и регистрации,
 * если нужные элементы есть на текущей странице.
 */
function initAuthUi() {
  console.log("[auth] initAuthUi");

  // ---------- ВХОД ----------
  const loginEmail    = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const btnLogin      = document.getElementById("btnLogin");
  const authMessage   = document.getElementById("authMessage");
  const btnForgotPassword = document.getElementById("btnForgotPassword");
  const btnGoogleLogin = document.getElementById("btnGoogleLogin");
  const btnToggleLoginPassword = document.getElementById("btnToggleLoginPassword");

  const setAuthMessage = (text, type = "error") => {
    if (!authMessage) return;
    if (!text) {
      authMessage.textContent = "";
      authMessage.hidden = true;
      authMessage.removeAttribute("data-type");
      return;
    }
    authMessage.textContent = text;
    authMessage.hidden = false;
    authMessage.setAttribute("data-type", type);
  };

  const setFieldError = (input: HTMLElement | null, hasError: boolean) => {
    if (!input) return;
    input.closest(".auth-field")?.classList.toggle("has-error", hasError);
    if (input instanceof HTMLInputElement) {
      input.setAttribute("aria-invalid", hasError ? "true" : "false");
    }
  };

  const clearLoginErrors = () => {
    setFieldError(loginEmail as HTMLElement | null, false);
    setFieldError(loginPassword as HTMLElement | null, false);
  };

  const setLoginBusy = (isBusy: boolean) => {
    [loginEmail, loginPassword, btnLogin, btnGoogleLogin, btnToggleLoginPassword].forEach((control) => {
      if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
        control.disabled = isBusy;
      }
    });

    if (btnForgotPassword instanceof HTMLAnchorElement) {
      btnForgotPassword.classList.toggle("is-disabled", isBusy);
      btnForgotPassword.setAttribute("aria-disabled", isBusy ? "true" : "false");
      if (isBusy) {
        btnForgotPassword.tabIndex = -1;
      } else {
        btnForgotPassword.removeAttribute("tabindex");
      }
    }
  };

  if (loginEmail instanceof HTMLInputElement && loginPassword instanceof HTMLInputElement) {
    [loginEmail, loginPassword].forEach((input) => {
      input.addEventListener("input", () => {
        setFieldError(input, false);
        if (!authMessage?.hidden) {
          setAuthMessage("");
        }
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && btnLogin instanceof HTMLButtonElement) {
          event.preventDefault();
          btnLogin.click();
        }
      });
    });
  }

  if (btnToggleLoginPassword instanceof HTMLButtonElement && loginPassword instanceof HTMLInputElement) {
    const toggleLabel = btnToggleLoginPassword.querySelector<HTMLElement>(".auth-visually-hidden");

    btnToggleLoginPassword.addEventListener("click", () => {
      const passwordIsVisible = loginPassword.type === "text";
      loginPassword.type = passwordIsVisible ? "password" : "text";
      btnToggleLoginPassword.classList.toggle("is-visible", !passwordIsVisible);
      btnToggleLoginPassword.setAttribute("aria-label", passwordIsVisible ? "Показать пароль" : "Скрыть пароль");
      btnToggleLoginPassword.setAttribute("aria-pressed", passwordIsVisible ? "false" : "true");
      if (toggleLabel) {
        toggleLabel.textContent = passwordIsVisible ? "Показать пароль" : "Скрыть пароль";
      }
      loginPassword.focus();
    });
  }

  if (btnLogin instanceof HTMLButtonElement && loginEmail instanceof HTMLInputElement && loginPassword instanceof HTMLInputElement) {
    console.log("[auth] login elements found");
    btnLogin.addEventListener("click", async () => {
      setAuthMessage("");
      clearLoginErrors();
      const email = loginEmail.value.trim();
      const pass  = loginPassword.value;

      if (!email || !pass) {
        if (!email) {
          setFieldError(loginEmail, true);
        }
        if (!pass) {
          setFieldError(loginPassword, true);
        }
        setAuthMessage("Введите email и пароль.", "warn");
        (!email ? loginEmail : loginPassword).focus();
        return;
      }

      if (!loginEmail.checkValidity()) {
        setFieldError(loginEmail, true);
        setAuthMessage("Введите корректный email.", "warn");
        loginEmail.focus();
        return;
      }

      try {
        setLoginBusy(true);
        await signInWithEmailAndPassword(auth, email, pass);
        sessionStorage.setItem("just_logged_in", "true");
        window.location.href = "index.html";
      } catch (err) {
        console.error("Ошибка входа:", err);
        const message = mapAuthError(err) || "Неправильный email или пароль.";
        setFieldError(loginEmail, true);
        setFieldError(loginPassword, true);
        setAuthMessage(message, "error");
      } finally {
        setLoginBusy(false);
      }
    });
  }

  // ---------- ВОССТАНОВЛЕНИЕ ПАРОЛЯ ----------
  if (btnForgotPassword) {
    btnForgotPassword.addEventListener("click", async (e) => {
      e.preventDefault(); // Предотвращаем переход по ссылке
      const email = loginEmail instanceof HTMLInputElement ? loginEmail.value.trim() : "";
      
      if (!email) {
        setFieldError(loginEmail as HTMLElement | null, true);
        if (loginEmail instanceof HTMLInputElement) {
          loginEmail.focus();
        }
        await showAlert("Введите email для восстановления пароля.", "Внимание");
        return;
      }

      try {
        await sendPasswordResetEmail(auth, email);
        await showAlert("Письмо с инструкциями по восстановлению пароля отправлено на " + email, "Успех");
      } catch (err) {
        console.error("Ошибка восстановления пароля:", err);
        await showAlert(mapAuthError(err), "Ошибка");
      }
    });
  }

  // ---------- ВХОД ЧЕРЕЗ GOOGLE ----------
  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener("click", async () => {
      try {
        setAuthMessage("");
        clearLoginErrors();
        setLoginBusy(true);
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        if (getAdditionalUserInfo(result)?.isNewUser) {
          localStorage.setItem(PENDING_WELCOME_KEY, PENDING_WELCOME_NEW_USER);
        } else {
          localStorage.removeItem(PENDING_WELCOME_KEY);
        }
        sessionStorage.setItem("just_logged_in", "true");
        window.location.href = "index.html";
      } catch (err) {
        console.error("Ошибка входа через Google:", err);
        if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
          setAuthMessage(mapAuthError(err), "error");
        }
      } finally {
        setLoginBusy(false);
      }
    });
  }

  // ---------- РЕГИСТРАЦИЯ ----------
  const registerEmail    = document.getElementById("registerEmail");
  const registerPassword = document.getElementById("registerPassword");
  const btnRegister      = document.getElementById("btnRegister");

  if (btnRegister && registerEmail && registerPassword) {
    console.log("[auth] register elements found");
    btnRegister.addEventListener("click", async () => {
      const email = registerEmail.value.trim();
      const pass  = registerPassword.value;

      if (!email || !pass) {
        await showAlert("Укажи email и пароль.", "Внимание");
        return;
      }

      if (pass.length < 6) {
        await showAlert("Пароль должен быть не короче 6 символов.", "Внимание");
        return;
      }

      try {
        await createUserWithEmailAndPassword(auth, email, pass);
        localStorage.setItem(PENDING_WELCOME_KEY, PENDING_WELCOME_NEW_USER);
        await showAlert("Аккаунт создан.", "Успех");
        window.location.href = "login.html";
      } catch (err) {
        console.error("Ошибка регистрации:", err);
        await showAlert(mapAuthError(err), "Ошибка");
      }
    });
  }

  // ---------- РЕГИСТРАЦИЯ ЧЕРЕЗ GOOGLE ----------
  const btnGoogleRegister = document.getElementById("btnGoogleRegister");
  if (btnGoogleRegister) {
    btnGoogleRegister.addEventListener("click", async () => {
      try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        if (getAdditionalUserInfo(result)?.isNewUser) {
          localStorage.setItem(PENDING_WELCOME_KEY, PENDING_WELCOME_NEW_USER);
        } else {
          localStorage.removeItem(PENDING_WELCOME_KEY);
        }
        sessionStorage.setItem("just_logged_in", "true");
        window.location.href = "index.html";
      } catch (err) {
        console.error("Ошибка регистрации через Google:", err);
        if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
          await showAlert(mapAuthError(err), "Ошибка");
        }
      }
    });
  }
}

/**
 * Переводим коды ошибок Firebase Auth в человекочитаемые сообщения.
 */
function mapAuthError(err) {
  const code = err?.code || "";

  switch (code) {
    case "auth/email-already-in-use":
      return "Такой email уже используется.";
    case "auth/invalid-email":
      return "Некорректный email.";
    case "auth/weak-password":
      return "Слишком простой пароль (минимум 6 символов).";
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Неправильный email или пароль.";
    case "auth/operation-not-allowed":
      return "Email/пароль ещё не включены в настройках Firebase Auth.";
    case "auth/unauthorized-domain":
      return "Домен не добавлен в список разрешённых в Firebase Auth. Добавьте домен в настройках Firebase: Authentication → Settings → Authorized domains.";
    case "auth/popup-blocked":
      return "Всплывающее окно было заблокировано браузером. Разрешите всплывающие окна для этого сайта.";
    case "auth/popup-closed-by-user":
      return ""; // Не показываем ошибку, если пользователь сам закрыл окно
    case "auth/cancelled-popup-request":
      return ""; // Не показываем ошибку при отмене
    default:
      return "Неправильный email или пароль.";
  }
}

// Сразу вызываем инициализацию.
// Скрипт подключается в конце <body>, поэтому разметка уже готова.
initLoginBrandAnimation();
initAuthUi();

// Экспорт для кнопки «Выйти» в app.js
export async function logoutUser() {
  await signOut(auth);
}
