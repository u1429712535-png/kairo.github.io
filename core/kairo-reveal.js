(function () {
    const menuToggle = document.getElementById("kairoMenuToggle");
    const menuOptions = document.getElementById("kairoMenuOptions");
    const saveButton = document.getElementById("kairoSaveButton");
    const quitButton = document.getElementById("kairoQuitButton");
    const menuStatus = document.getElementById("kairoMenuStatus");
    const customCursor = document.getElementById("kairoCustomCursor");
    const saveKey = "valdorian_progress_save";
    const saveCooldown = 5 * 60 * 1000;

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
        menuToggle.setAttribute("aria-label", isOpen ? "Fermer le menu" : "Ouvrir le menu");
        menuOptions.setAttribute("aria-hidden", String(!isOpen));
        menuOptions.classList.toggle("open", isOpen);
    }

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

    if (saveButton && menuStatus) {
        saveButton.addEventListener("click", () => {
            const progress = window.valdorianProgress;

            if (!progress) {
                menuStatus.textContent = "Aucune progression de jeu n’est disponible à sauvegarder pour le moment.";
                return;
            }

            const remainingTime = saveCooldown - (Date.now() - getLastSaveTime());

            if (remainingTime > 0) {
                menuStatus.textContent = `Prochaine sauvegarde possible dans ${Math.ceil(remainingTime / 60000)} min.`;
                return;
            }

            try {
                localStorage.setItem(saveKey, JSON.stringify({
                    savedAt: Date.now(),
                    progress
                }));
                menuStatus.textContent = "Progression sauvegardée.";
            } catch {
                menuStatus.textContent = "La sauvegarde a échoué. Vérifie l’espace de stockage disponible.";
            }
        });
    }

    if (quitButton) {
        quitButton.addEventListener("click", () => {
            if (Date.now() - getLastSaveTime() >= saveCooldown) {
                const shouldQuit = window.confirm("Tu n’as pas sauvegardé depuis au moins 5 minutes. Quitter quand même ?");

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

        blackScreen.classList.add("finished", "revealing");
        blackScreen.setAttribute("aria-hidden", "true");
        revealLayer.setAttribute("aria-hidden", "false");
        revealLayer.classList.add("visible");
    };
})();