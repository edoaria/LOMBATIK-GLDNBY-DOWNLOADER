document.addEventListener("DOMContentLoaded", () => {
    const downloadForm = document.getElementById("downloadForm");
    const tiktokUrlInput = document.getElementById("tiktokUrl");
    const loadingDiv = document.getElementById("loading");
    const loadingText = document.getElementById("loadingText");
    const errorMsg = document.getElementById("errorMsg");
    const resultSection = document.getElementById("resultSection");

    const videoThumb = document.getElementById("videoThumb");
    const videoTitle = document.getElementById("videoTitle");
    const videoAuthor = document.getElementById("videoAuthor");

    const dlNoWatermark = document.getElementById("dlNoWatermark");
    const dlMp3 = document.getElementById("dlMp3");
    const dlDirectLink = document.getElementById("dlDirectLink");

    const API_ENDPOINTS = [
        "https://www.tikwm.com/api/",
        "https://tikwm.com/api/"
    ];

    const REQUEST_TIMEOUT_MS = 15000;

    let activeMedia = {
        noWatermark: "",
        mp3: "",
        title: "tiktok_video"
    };

    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.style.display = "block";
    }

    function clearError() {
        errorMsg.textContent = "";
        errorMsg.style.display = "none";
    }

    function isTikTokUrl(value) {
        try {
            const parsed = new URL(value);
            const host = parsed.hostname.toLowerCase();
            return parsed.protocol === "https:" &&
                (host === "tiktok.com" || host.endsWith(".tiktok.com"));
        } catch {
            return false;
        }
    }

    async function fetchJsonWithTimeout(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: "GET",
                signal: controller.signal,
                headers: { "Accept": "application/json" }
            });

            if (!response.ok) {
                throw new Error(`Layanan mengembalikan status ${response.status}.`);
            }

            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    function normalizeMediaUrl(value) {
        if (!value || typeof value !== "string") return "";
        if (/^https?:\/\//i.test(value)) return value;
        if (value.startsWith("//")) return `https:${value}`;
        return `https://www.tikwm.com${value.startsWith("/") ? "" : "/"}${value}`;
    }

    function getVideoUrl(data) {
        // hdplay adalah kandidat HD dari API. play hanya dipakai sebagai
        // fallback jika tidak ada hdplay; kualitasnya tidak bisa dijamin HD.
        const hd = normalizeMediaUrl(data.hdplay);
        const standard = normalizeMediaUrl(data.play);

        if (hd) return { url: hd, quality: "HD" };
        if (standard) return { url: standard, quality: "standar" };
        return { url: "", quality: "" };
    }

    async function fetchTikTokData(tiktokUrl) {
        let lastError = null;

        for (const endpoint of API_ENDPOINTS) {
            try {
                const requestUrl = `${endpoint}?url=${encodeURIComponent(tiktokUrl)}`;
                const json = await fetchJsonWithTimeout(requestUrl);

                if (json && json.code === 0 && json.data) {
                    const data = json.data;
                    const video = getVideoUrl(data);
                    const music = normalizeMediaUrl(data.music);

                    if (!video.url) {
                        throw new Error("Layanan tidak memberikan tautan video yang bisa digunakan.");
                    }

                    return {
                        cover: normalizeMediaUrl(data.cover || data.origin_cover),
                        title: data.title || "Video TikTok",
                        author: data.author
                            ? `@${data.author.unique_id || "user"}${data.author.nickname ? ` (${data.author.nickname})` : ""}`
                            : "@user",
                        videoUrl: video.url,
                        quality: video.quality,
                        mp3: music
                    };
                }

                throw new Error(json?.msg || "Layanan tidak dapat memproses video ini.");
            } catch (error) {
                lastError = error;
                console.warn(`API ${endpoint} gagal:`, error);
            }
        }

        if (lastError?.name === "AbortError") {
            throw new Error("Permintaan ke layanan terlalu lama. Coba lagi beberapa saat.");
        }

        throw new Error(
            "Video tidak dapat diproses oleh layanan saat ini. Pastikan tautan benar dan video bersifat publik, lalu coba lagi nanti."
        );
    }

    downloadForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const url = tiktokUrlInput.value.trim();
        clearError();

        if (!url) {
            showError("Silakan masukkan tautan TikTok terlebih dahulu.");
            return;
        }

        if (!isTikTokUrl(url)) {
            showError("Masukkan tautan HTTPS dari tiktok.com yang valid.");
            return;
        }

        loadingText.textContent = "Menganalisis tautan video...";
        loadingDiv.style.display = "flex";
        resultSection.style.display = "none";
        dlDirectLink.removeAttribute("href");

        try {
            const data = await fetchTikTokData(url);

            videoThumb.src = data.cover || "";
            videoThumb.alt = `Thumbnail ${data.title}`;
            videoTitle.textContent = data.title;
            videoAuthor.textContent = `Oleh: ${data.author}`;

            activeMedia.noWatermark = data.videoUrl;
            activeMedia.mp3 = data.mp3;
            activeMedia.title = (data.title || "tiktok_download")
                .normalize("NFKD")
                .replace(/[^a-zA-Z0-9_-]/g, "_")
                .replace(/_+/g, "_")
                .substring(0, 50) || "tiktok_download";

            dlDirectLink.href = data.videoUrl;

            const noWmText = dlNoWatermark.querySelector(".btn-text");
            if (noWmText) {
                noWmText.textContent = data.quality === "HD"
                    ? "Download Video HD (Tanpa Watermark)"
                    : "Download Video (Tanpa Watermark, HD tidak dijamin)";
            }

            dlNoWatermark.disabled = false;
            dlMp3.disabled = !data.mp3;
            resultSection.style.display = "block";

            if (data.quality !== "HD") {
                showError("Catatan: layanan tidak menyediakan tautan HD untuk video ini. Tautan video tersedia, tetapi kualitas HD tidak dijamin.");
            }
        } catch (error) {
            showError(error.message || "Terjadi kesalahan saat memproses tautan.");
        } finally {
            loadingDiv.style.display = "none";
        }
    });

    async function downloadFile(fileUrl, filename, button) {
        clearError();

        if (!fileUrl) {
            showError("Tautan file tidak tersedia untuk pilihan ini.");
            return;
        }

        const textSpan = button.querySelector(".btn-text");
        const originalText = textSpan ? textSpan.textContent : button.textContent;
        button.disabled = true;
        if (textSpan) textSpan.textContent = "⏳ Membuka unduhan...";

        try {
            // Browser bisa memblokir fetch lintas domain (CORS). Jika demikian,
            // buka URL sumber langsung tanpa mengirim URL video ke proxy pihak ketiga.
            const response = await fetch(fileUrl);

            if (!response.ok) {
                throw new Error(`Server file merespons status ${response.status}.`);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (error) {
            console.warn("Unduhan langsung tidak bisa dilakukan dari browser:", error);
            window.open(fileUrl, "_blank", "noopener,noreferrer");
            showError("Browser membatasi unduhan langsung. Tautan video dibuka di tab baru; gunakan menu Simpan/Unduh dari browser jika tersedia.");
        } finally {
            if (textSpan) textSpan.textContent = originalText;
            button.disabled = false;
        }
    }

    dlNoWatermark.addEventListener("click", () => {
        downloadFile(activeMedia.noWatermark, `${activeMedia.title}_NoWM.mp4`, dlNoWatermark);
    });

    dlMp3.addEventListener("click", () => {
        downloadFile(activeMedia.mp3, `${activeMedia.title}_Audio.mp3`, dlMp3);
    });
});
