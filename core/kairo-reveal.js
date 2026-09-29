(function () {
    const menuToggle = document.getElementById("kairoMenuToggle");
    const menuOptions = document.getElementById("kairoMenuOptions");
    const saveButton = document.getElementById("kairoSaveButton");
    const quitButton = document.getElementById("kairoQuitButton");
    const optionsButton = document.getElementById("kairoOptionsButton");
    const menuStatus = document.getElementById("kairoMenuStatus");
    const settingsPanel = document.getElementById("kairoSettingsPanel");
    const settingsClose = document.getElementById("kairoSettingsClose");
    const settingsTitlebar = document.getElementById("kairoSettingsTitlebar");
    const refugeButton = document.getElementById("kairoRefugeButton");
    const refugeModal = document.getElementById("kairoRefugeModal");
    const refugeClose = document.getElementById("kairoRefugeClose");
    const sensitivityInput = document.getElementById("kairoSensitivity");
    const sensitivityValue = document.getElementById("kairoSensitivityValue");
    const languageButtons = [...document.querySelectorAll("[data-language]")];
    const visualEffectsInput = document.getElementById("kairoVisualEffects");
    const customCursor = document.getElementById("kairoCustomCursor");
    const saveKey = "valdorian_progress_save";
    const saveCooldown = 5 * 60 * 1000;
    const settingsKey = "valdorian_settings";
    let welcomeTypingTimer = null;
    let introductionStarted = false;
    let welcomePhase = 1;
    const translations = {
        fr: {
            save: "Sauvegarder",
            quit: "Quitter",
            options: "Options",
            openMenu: "Ouvrir le menu",
            closeMenu: "Fermer le menu",
            settingsTitle: "Options",
            closeSettings: "Fermer les options",
            sensitivity: "Sensibilité de la souris",
            decreaseSensitivity: "Diminuer la sensibilité",
            increaseSensitivity: "Augmenter la sensibilité",
            language: "Langue",
            chooseFrench: "Choisir le français",
            chooseEnglish: "Choisir l’anglais",
            visualEffects: "Effets visuels",
            bootLabel: "VALDORIAN · CONNEXION ÉTABLIE",
            welcomeLead: (name) => `Bienvenue à toi, ${name}, dans Valdorian.`,
            welcomeStory: "Tu vas te lancer à la découverte d’un monde incroyable.",
            welcomeQuestion: "Es-tu prêt à le découvrir ?",
            journeyWarning: "Ce monde ne vous fera pas de cadeaux.",
            journeyDanger: "Chaque expédition peut être la fin de votre aventure.",
            journeyPrepare: "Préparez-vous et adaptez-vous aux terres rudes.",
            journeyQuestion: "Survivrez-vous assez longtemps pour percer le secret de Valdorian ?",
            yes: "Oui",
            no: "Non",
            saveUnavailable: "Aucune progression de jeu n’est disponible à sauvegarder pour le moment.",
            saveWait: (minutes) => `Prochaine sauvegarde possible dans ${minutes} min.`,
            saveDone: "Progression sauvegardée.",
            saveFailed: "La sauvegarde a échoué. Vérifie l’espace de stockage disponible.",
            quitPrompt: "Tu n’as pas sauvegardé depuis au moins 5 minutes. Quitter quand même ?"
        },
        en: {
            save: "Save",
            quit: "Quit",
            options: "Options",
            openMenu: "Open menu",
            closeMenu: "Close menu",
            settingsTitle: "Options",
            closeSettings: "Close options",
            sensitivity: "Mouse sensitivity",
            decreaseSensitivity: "Decrease sensitivity",
            increaseSensitivity: "Increase sensitivity",
            language: "Language",
            chooseFrench: "Choose French",
            chooseEnglish: "Choose English",
            visualEffects: "Visual effects",
            bootLabel: "VALDORIAN · CONNECTION ESTABLISHED",
            welcomeLead: (name) => `Welcome, ${name}, to Valdorian.`,
            welcomeStory: "You are about to discover an incredible world.",
            welcomeQuestion: "Are you ready to discover it?",
            journeyWarning: "This world will show you no mercy.",
            journeyDanger: "Every expedition could be the end of your adventure.",
            journeyPrepare: "Prepare yourself and adapt to these harsh lands.",
            journeyQuestion: "Will you survive long enough to uncover Valdorian’s secret?",
            yes: "Yes",
            no: "No",
            saveUnavailable: "There is no game progress available to save yet.",
            saveWait: (minutes) => `Next save available in ${minutes} min.`,
            saveDone: "Progress saved.",
            saveFailed: "Save failed. Check available storage space.",
            quitPrompt: "You have not saved in at least 5 minutes. Quit anyway?"
        }
    };

    function loadSettings() {
        try {
            const storedSettings = JSON.parse(localStorage.getItem(settingsKey) || "{}");
            const sensitivity = Number(storedSettings.mouseSensitivity);

            return {
                mouseSensitivity: Number.isFinite(sensitivity) ? Math.min(2, Math.max(0.5, sensitivity)) : 1,
                language: storedSettings.language === "en" ? "en" : "fr",
                visualEffects: storedSettings.visualEffects !== false
            };
        } catch {
            return { mouseSensitivity: 1, language: "fr", visualEffects: true };
        }
    }

    const settings = loadSettings();
    window.valdorianSettings = settings;

    function saveSettings() {
        try {
            localStorage.setItem(settingsKey, JSON.stringify(settings));
        } catch {
            return;
        }
    }

    function translate(key, ...values) {
        const message = translations[settings.language][key];
        return typeof message === "function" ? message(...values) : message;
    }

    function applyLanguage() {
        document.documentElement.lang = settings.language;
        document.querySelectorAll("[data-i18n]").forEach((element) => {
            element.textContent = translate(element.dataset.i18n);
        });
        document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
            element.setAttribute("aria-label", translate(element.dataset.i18nAria));
        });
        if (introductionStarted) {
            startWelcomeTyping();
        }
    }

    function startWelcomeTyping(phase = welcomePhase) {
        const welcomeText = document.getElementById("kairoWelcomeText");
        const caret = document.getElementById("kairoWelcomeCaret");
        const welcomeActions = document.getElementById("kairoWelcomeActions");
        const journeyActions = document.getElementById("kairoJourneyActions");
        if (!welcomeText || !caret || !welcomeActions || !journeyActions) {
            return;
        }

        welcomePhase = phase;
        window.clearTimeout(welcomeTypingTimer);
        const playerName = window.valdorianPlayerName || "voyageur";
        const message = phase === 1
            ? [
                translate("welcomeLead", playerName),
                translate("welcomeStory"),
                translate("welcomeQuestion")
            ].join("\n\n")
            : [
                translate("journeyWarning"),
                translate("journeyDanger"),
                translate("journeyPrepare"),
                translate("journeyQuestion")
            ].join("\n\n");
        welcomeText.textContent = "";
        welcomeActions.hidden = true;
        journeyActions.hidden = true;
        const actions = phase === 1 ? welcomeActions : journeyActions;

        const reducedMotion = !settings.visualEffects || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reducedMotion) {
            welcomeText.textContent = message;
            caret.hidden = true;
            actions.hidden = false;
            return;
        }

        caret.hidden = false;
        let position = 0;
        const typeNextCharacter = () => {
            if (position >= message.length) {
                caret.hidden = true;
                actions.hidden = false;
                return;
            }

            const character = message[position];
            welcomeText.textContent += character;
            position += 1;
            const delay = character === "\n" ? 170 : ".?!,:;".includes(character) ? 210 : 36;
            welcomeTypingTimer = window.setTimeout(typeNextCharacter, delay);
        };

        typeNextCharacter();
    }

    function returnToGameMenu() {
        window.clearTimeout(welcomeTypingTimer);
        document.body.classList.remove("kairo-interface-active");
        const revealLayer = document.getElementById("kairoImageReveal");
        const gameContent = document.getElementById("gameContent");
        const loginRequired = document.getElementById("loginRequired");

        if (revealLayer) {
            revealLayer.classList.add("kairo-intro-dismissed");
            revealLayer.setAttribute("aria-hidden", "true");
        }
        if (gameContent) {
            gameContent.style.display = "block";
        }
        if (loginRequired) {
            loginRequired.style.display = "none";
        }

        document.body.classList.remove("kairo-cursor-active");
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }

    function activateSaveProgress(progress) {
        window.valdorianProgress = progress;
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = translate("save");
            saveButton.removeAttribute("title");
        }
    }

    async function startFinalWorldReveal() {
        const introScreen = document.getElementById("kairoImageReveal");
        const finalScreen = document.getElementById("kairoFinalScreen");
        const finalYesButton = document.getElementById("kairoFinalYes");

        if (!introScreen || !finalScreen || !finalYesButton || finalYesButton.disabled) {
            return;
        }

        finalYesButton.disabled = true;
        window.clearTimeout(welcomeTypingTimer);
        document.getElementById("kairoJourneyActions").hidden = true;
        setMenuOpen(false);
        introScreen.classList.add("kairo-crt-power-off");

        await new Promise((resolve) => window.setTimeout(resolve, 700));
        introScreen.classList.add("kairo-intro-dismissed");
        introScreen.setAttribute("aria-hidden", "true");

        finalScreen.hidden = false;
        finalScreen.setAttribute("aria-hidden", "false");
        await new Promise((resolve) => window.setTimeout(resolve, 3000));

        finalScreen.classList.add("powering-on");
        const refugeButton = document.getElementById("kairoRefugeButton");
        if (refugeButton) {
            refugeButton.hidden = false;
        }

        activateSaveProgress({
            stage: "refuge",
            reachedAt: Date.now()
        });
    }

    window.restoreKairoProgress = function (save) {
        const progress = save?.progress;
        const introScreen = document.getElementById("kairoImageReveal");
        const finalScreen = document.getElementById("kairoFinalScreen");
        const refugeButton = document.getElementById("kairoRefugeButton");

        if (!progress || progress.stage !== "refuge" || !finalScreen) {
            return false;
        }

        if (introScreen) {
            introScreen.classList.add("kairo-intro-dismissed");
            introScreen.setAttribute("aria-hidden", "true");
        }
        finalScreen.hidden = false;
        finalScreen.setAttribute("aria-hidden", "false");
        finalScreen.classList.add("powering-on");
        if (refugeButton) {
            refugeButton.hidden = false;
        }
        document.body.classList.add("kairo-interface-active");
        if (customCursor) {
            document.body.classList.add("kairo-cursor-active");
        }
        activateSaveProgress(progress);

        try {
            localStorage.setItem(saveKey, JSON.stringify(save));
        } catch {
            // The server copy remains available if local storage is full.
        }

        return true;
    }

    function applySettings() {
        document.body.classList.toggle("kairo-reduced-effects", !settings.visualEffects);
        if (sensitivityInput && sensitivityValue) {
            sensitivityInput.value = String(settings.mouseSensitivity);
            sensitivityValue.value = `${settings.mouseSensitivity.toFixed(1)}×`;
        }
        languageButtons.forEach((button) => {
            button.setAttribute("aria-checked", String(button.dataset.language === settings.language));
        });
        if (visualEffectsInput) {
            visualEffectsInput.checked = settings.visualEffects;
        }
        applyLanguage();
    }

    function getLastSaveTime() {
        try {
            const savedProgress = JSON.parse(localStorage.getItem(saveKey) || "null");
            return Number.isFinite(savedProgress?.savedAt) ? savedProgress.savedAt : 0;
        } catch {
            return 0;
        }
    }

    function setMenuOpen(isOpen) {
        if (!menuToggle || !menuOptions) {
            return;
        }

        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.setAttribute("aria-label", translate(isOpen ? "closeMenu" : "openMenu"));
        menuOptions.setAttribute("aria-hidden", String(!isOpen));
        menuOptions.classList.toggle("open", isOpen);
    }

    function openSettings() {
        if (!settingsPanel) {
            return;
        }

        setMenuOpen(false);
        settingsPanel.hidden = false;
        settingsPanel.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => settingsPanel.classList.add("open"));
        sensitivityInput?.focus();
    }

    function closeSettings() {
        if (!settingsPanel) {
            return;
        }

        settingsPanel.classList.remove("open");
        settingsPanel.setAttribute("aria-hidden", "true");
        window.setTimeout(() => {
            if (settingsPanel.getAttribute("aria-hidden") === "true") {
                settingsPanel.hidden = true;
            }
        }, 200);
        optionsButton?.focus();
    }

    function openRefugeModal() {
        if (!refugeModal) {
            return;
        }

        setMenuOpen(false);
        if (settingsPanel && !settingsPanel.hidden) {
            closeSettings();
        }
        refugeModal.hidden = false;
        refugeModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("kairo-refuge-modal-open");
        refugeButton?.setAttribute("aria-expanded", "true");
        refugeClose?.focus();
    }

    function closeRefugeModal() {
        if (!refugeModal || refugeModal.hidden) {
            return;
        }

        refugeModal.hidden = true;
        refugeModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("kairo-refuge-modal-open");
        refugeButton?.setAttribute("aria-expanded", "false");
        refugeButton?.focus();
    }

    applySettings();

    document.getElementById("kairoWelcomeYes")?.addEventListener("click", () => {
        startWelcomeTyping(2);
    });

    document.getElementById("kairoWelcomeNo")?.addEventListener("click", returnToGameMenu);
    document.getElementById("kairoFinalYes")?.addEventListener("click", startFinalWorldReveal);

    if (menuToggle && menuOptions) {
        menuToggle.addEventListener("click", () => {
            setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
        });

        document.addEventListener("pointerdown", (event) => {
            if (!menuToggle.contains(event.target) && !menuOptions.contains(event.target)) {
                setMenuOpen(false);
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        });
    }

    optionsButton?.addEventListener("click", openSettings);
    settingsClose?.addEventListener("click", closeSettings);
    refugeButton?.addEventListener("click", openRefugeModal);
    refugeClose?.addEventListener("click", closeRefugeModal);
    refugeModal?.addEventListener("click", (event) => {
        if (event.target === refugeModal) {
            closeRefugeModal();
        }
    });

    document.getElementById("kairoImageReveal")?.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openSettings();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }
        if (refugeModal && !refugeModal.hidden) {
            closeRefugeModal();
        } else if (settingsPanel && !settingsPanel.hidden) {
            closeSettings();
        }
    });

    if (settingsPanel && settingsTitlebar) {
        let dragOffset = null;

        settingsTitlebar.addEventListener("pointerdown", (event) => {
            if (event.target.closest("button")) {
                return;
            }

            const bounds = settingsPanel.getBoundingClientRect();
            dragOffset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
            settingsPanel.style.left = `${bounds.left}px`;
            settingsPanel.style.top = `${bounds.top}px`;
            settingsPanel.style.transform = "none";
            settingsTitlebar.setPointerCapture(event.pointerId);
        });

        settingsTitlebar.addEventListener("pointermove", (event) => {
            if (!dragOffset) {
                return;
            }

            const bounds = settingsPanel.getBoundingClientRect();
            const left = Math.min(Math.max(8, event.clientX - dragOffset.x), window.innerWidth - bounds.width - 8);
            const top = Math.min(Math.max(8, event.clientY - dragOffset.y), window.innerHeight - bounds.height - 8);
            settingsPanel.style.left = `${left}px`;
            settingsPanel.style.top = `${top}px`;
        });

        settingsTitlebar.addEventListener("pointerup", () => {
            dragOffset = null;
        });

        settingsTitlebar.addEventListener("pointercancel", () => {
            dragOffset = null;
        });
    }

    sensitivityInput?.addEventListener("input", () => {
        settings.mouseSensitivity = Number(sensitivityInput.value);
        sensitivityValue.value = `${settings.mouseSensitivity.toFixed(1)}×`;
        saveSettings();
    });

    languageButtons.forEach((button, index) => {
        button.addEventListener("click", () => {
            settings.language = button.dataset.language === "en" ? "en" : "fr";
            saveSettings();
            applySettings();
        });

        button.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                return;
            }

            event.preventDefault();
            const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
            const nextButton = languageButtons[(index + direction + languageButtons.length) % languageButtons.length];
            nextButton.focus();
            nextButton.click();
        });
    });

    visualEffectsInput?.addEventListener("change", () => {
        settings.visualEffects = visualEffectsInput.checked;
        saveSettings();
        applySettings();
    });

    if (saveButton && menuStatus) {
        saveButton.addEventListener("click", async () => {
            const progress = window.valdorianProgress;

            if (!progress) {
                menuStatus.textContent = translate("saveUnavailable");
                return;
            }

            const remainingTime = saveCooldown - (Date.now() - getLastSaveTime());

            if (remainingTime > 0) {
                menuStatus.textContent = translate("saveWait", Math.ceil(remainingTime / 60000));
                return;
            }

            try {
                const token = localStorage.getItem("valdorian_session");
                const response = await fetch(`${window.valdorianApiUrl}/save`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ progress })
                });

                if (!response.ok) {
                    throw new Error("La sauvegarde distante a échoué.");
                }

                const result = await response.json();
                if (!result.success || !result.save) {
                    throw new Error("La sauvegarde distante a échoué.");
                }

                try {
                    localStorage.setItem(saveKey, JSON.stringify(result.save));
                } catch {
                    // The server save remains successful if local storage is full.
                }
                menuStatus.textContent = translate("saveDone");
            } catch {
                menuStatus.textContent = translate("saveFailed");
            }
        });
    }

    if (quitButton) {
        quitButton.addEventListener("click", () => {
            if (Date.now() - getLastSaveTime() >= saveCooldown) {
                const shouldQuit = window.confirm(translate("quitPrompt"));

                if (!shouldQuit) {
                    return;
                }
            }

            window.location.href = "../index.html";
        });
    }

    if (customCursor) {
        window.addEventListener("pointermove", (event) => {
            customCursor.style.left = `${event.clientX - 22}px`;
            customCursor.style.top = `${event.clientY - 7}px`;
        }, { passive: true });
    }

    window.revealKairoImage = function () {
        const blackScreen = document.getElementById("kairoBlackScreen");
        const revealLayer = document.getElementById("kairoImageReveal");

        if (!blackScreen || !revealLayer) {
            return;
        }

        if (customCursor) {
            document.body.classList.add("kairo-cursor-active");
        }

        document.body.classList.add("kairo-interface-active");
        blackScreen.classList.add("finished", "revealing");
        blackScreen.setAttribute("aria-hidden", "true");
        revealLayer.setAttribute("aria-hidden", "false");
        revealLayer.classList.add("visible");
        introductionStarted = true;
        startWelcomeTyping();
    };
})();