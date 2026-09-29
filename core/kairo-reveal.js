(function () {
    const customCursor = document.getElementById("kairoCustomCursor");

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