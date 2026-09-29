(function () {
    window.revealKairoImage = function () {
        const blackScreen = document.getElementById("kairoBlackScreen");
        const revealLayer = document.getElementById("kairoImageReveal");

        if (!blackScreen || !revealLayer) {
            return;
        }

        blackScreen.classList.add("finished", "revealing");
        blackScreen.setAttribute("aria-hidden", "true");
        revealLayer.setAttribute("aria-hidden", "false");
        revealLayer.classList.add("visible");
    };
})();