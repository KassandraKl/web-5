// ===== НАСТРОЙКИ =====
const API_KEY = "AIzaSyB5vr3pFPqAwzEku4AXIzlZI0SsiflKPqA";
const CHANNEL_ID = "UCZMYvSPulDSUdx7bdtTFdrg"; // CORTIS
const COMEBACK_DATE = new Date("2027-03-03T18:00:00+09:00"); // KST

// ===== ФОРМАТ ЧИСЕЛ =====
function formatNumber(num) {
    const n = parseInt(num, 10);
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// ===== ВЫБОР ЛУЧШЕГО ПРЕВЬЮ =====
function getBestThumbnail(thumbnails) {
    // Приоритет: maxres → standard → high → medium
    return thumbnails.maxres?.url
        || thumbnails.standard?.url
        || thumbnails.high?.url
        || thumbnails.medium?.url;
}

// ===== ПАРСИНГ ДЛИТЕЛЬНОСТИ (ISO 8601 → секунды) =====
function parseISODuration(iso) {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = parseInt(match[3] || 0, 10);
    return hours * 3600 + minutes * 60 + seconds;
}

// ===== ВСПОМОГАТЕЛЬНАЯ: ID загрузочного плейлиста =====
async function getUploadsPlaylistId() {
    const url = `https://www.googleapis.com/youtube/v3/channels` +
        `?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items?.length) throw new Error("Канал не найден");
    return data.items[0].contentDetails.relatedPlaylists.uploads;
}

// ===== ВСПОМОГАТЕЛЬНАЯ: все видео из плейлиста =====
async function getAllChannelVideos(playlistId) {
    let videos = [];
    let pageToken = "";

    do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems` +
            `?part=snippet&playlistId=${playlistId}&maxResults=50` +
            (pageToken ? `&pageToken=${pageToken}` : "") +
            `&key=${API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.items) {
            videos = videos.concat(data.items.map(item => ({
                id: item.snippet.resourceId.videoId,
                title: item.snippet.title,
                thumb: getBestThumbnail(item.snippet.thumbnails),
                published: item.snippet.publishedAt,
            })));
        }

        pageToken = data.nextPageToken || "";
    } while (pageToken);

    return videos;
}

// ===== ВСПОМОГАТЕЛЬНАЯ: статистика по списку ID =====
async function getVideosStats(ids) {
    const url = `https://www.googleapis.com/youtube/v3/videos` +
        `?part=statistics&id=${ids}&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    const viewsMap = {};
    if (data.items) {
        data.items.forEach(item => {
            viewsMap[item.id] = parseInt(item.statistics.viewCount || 0, 10);
        });
    }
    return viewsMap;
}

// ===== ВСПОМОГАТЕЛЬНАЯ: длительность по списку ID =====
async function getVideosDurations(ids) {
    const url = `https://www.googleapis.com/youtube/v3/videos` +
        `?part=contentDetails&id=${ids}&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    const durationsMap = {};
    if (data.items) {
        data.items.forEach(item => {
            durationsMap[item.id] = parseISODuration(item.contentDetails.duration);
        });
    }
    return durationsMap;
}

// ===== ВИДЖЕТ 1: Статистика канала =====
async function loadChannelStats() {
    const url = `https://www.googleapis.com/youtube/v3/channels` +
        `?part=snippet,statistics&id=${CHANNEL_ID}&key=${API_KEY}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.items?.length) throw new Error("Канал не найден");

        const { snippet, statistics } = data.items[0];

        document.getElementById("avatar").style.backgroundImage =
            `url('${getBestThumbnail(snippet.thumbnails)}')`;
        document.getElementById("channel-name").textContent = snippet.title;
        document.getElementById("channel-handle").textContent = snippet.customUrl || "";
        document.getElementById("subs").textContent = formatNumber(statistics.subscriberCount);
        document.getElementById("views").textContent = formatNumber(statistics.viewCount);
        document.getElementById("videos-count").textContent = formatNumber(statistics.videoCount);
        document.getElementById("status").textContent =
            `Обновлено: ${new Date().toLocaleTimeString("ru-RU")}`;
    } catch (e) {
        console.error("Ошибка статистики:", e);
        document.getElementById("status").textContent = "Ошибка загрузки";
    }
}

// ===== ВИДЖЕТ 2: Каунтдаун =====
function updateCountdown() {
    const now = new Date();
    const diff = COMEBACK_DATE - now;

    const targetEl = document.getElementById("cd-target");
    if (targetEl) {
        targetEl.textContent = `Цель: ${COMEBACK_DATE.toLocaleString("ru-RU")}`;
    }

    const countdownEl = document.getElementById("countdown");
    if (!countdownEl) return;

    if (diff <= 0) {
        countdownEl.innerHTML =
            `<p style="grid-column: span 2; text-align:center; font-size:1.3rem; color:#ef4444; font-weight:700;">Камбэк состоялся</p>`;
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    document.getElementById("cd-days").textContent = days;
    document.getElementById("cd-hours").textContent = String(hours).padStart(2, "0");
    document.getElementById("cd-mins").textContent = String(mins).padStart(2, "0");
    document.getElementById("cd-secs").textContent = String(secs).padStart(2, "0");
}

// ===== ВИДЖЕТ 3: Топ-5 видео =====
async function loadTopVideos() {
    const container = document.getElementById("top-videos");

    try {
        const playlistId = await getUploadsPlaylistId();
        const allVideos = await getAllChannelVideos(playlistId);

        if (!allVideos.length) throw new Error("Видео не найдены");

        // Статистика порциями по 50
        const viewsMap = {};
        for (let i = 0; i < allVideos.length; i += 50) {
            const chunk = allVideos.slice(i, i + 50).map(v => v.id).join(",");
            const chunkStats = await getVideosStats(chunk);
            Object.assign(viewsMap, chunkStats);
        }

        // Длительность порциями по 50
        const durationsMap = {};
        for (let i = 0; i < allVideos.length; i += 50) {
            const chunk = allVideos.slice(i, i + 50).map(v => v.id).join(",");
            const chunkDurations = await getVideosDurations(chunk);
            Object.assign(durationsMap, chunkDurations);
        }

        // Фильтр Shorts (≤70 сек), сортировка по просмотрам
        const sorted = allVideos
            .map(v => ({
                ...v,
                views: viewsMap[v.id] || 0,
                duration: durationsMap[v.id] || 0,
            }))
            .filter(v => v.duration > 70)
            .sort((a, b) => b.views - a.views)
            .slice(0, 5);

        container.innerHTML = sorted.map((v, i) => `
      <a class="video-item" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">
        <img class="video-thumb" src="${v.thumb}" alt="${v.title}"
             loading="lazy"
             onerror="this.style.background='#e8f5ec'">
        <div class="video-info">
          <div class="video-title">${v.title}</div>
          <div class="video-meta">${formatNumber(v.views)} просмотров · ${formatDate(v.published)}</div>
        </div>
        <div class="video-rank">#${i + 1}</div>
      </a>
    `).join("");
    } catch (e) {
        console.error("Ошибка топа:", e);
        container.innerHTML = `<p class="loading">Не удалось загрузить видео</p>`;
    }
}

// ===== ВИДЖЕТ 4: Комментарии с топ-5 видео =====
async function loadTopComments() {
    const container = document.getElementById("comment-list");

    try {
        const playlistId = await getUploadsPlaylistId();
        const allVideos = await getAllChannelVideos(playlistId);

        if (!allVideos.length) throw new Error("Видео не найдены");

        const viewsMap = {};
        for (let i = 0; i < allVideos.length; i += 50) {
            const chunk = allVideos.slice(i, i + 50).map(v => v.id).join(",");
            const chunkStats = await getVideosStats(chunk);
            Object.assign(viewsMap, chunkStats);
        }

        const durationsMap = {};
        for (let i = 0; i < allVideos.length; i += 50) {
            const chunk = allVideos.slice(i, i + 50).map(v => v.id).join(",");
            const chunkDurations = await getVideosDurations(chunk);
            Object.assign(durationsMap, chunkDurations);
        }

        const topVideos = allVideos
            .map(v => ({
                ...v,
                views: viewsMap[v.id] || 0,
                duration: durationsMap[v.id] || 0,
            }))
            .filter(v => v.duration > 70)
            .sort((a, b) => b.views - a.views)
            .slice(0, 5);

        if (!topVideos.length) throw new Error("Нет подходящих видео");

        // По 2 комментария с каждого видео, потом оставим только топ-6
        const commentsPerVideo = 2;
        const allComments = [];

        for (const video of topVideos) {
            try {
                const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads` +
                    `?part=snippet&videoId=${video.id}` +
                    `&order=relevance&maxResults=${commentsPerVideo}` +
                    `&textFormat=plainText&key=${API_KEY}`;
                const res = await fetch(commentsUrl);
                const data = await res.json();

                if (data.items) {
                    data.items.forEach(item => {
                        const c = item.snippet.topLevelComment.snippet;
                        allComments.push({
                            videoTitle: video.title,
                            videoId: video.id,
                            author: c.authorDisplayName,
                            avatar: c.authorProfileImageUrl || "",
                            text: c.textDisplay,
                            likes: parseInt(c.likeCount || 0, 10),
                        });
                    });
                }
            } catch (innerErr) {
                console.warn(`Комментарии недоступны для "${video.title}"`, innerErr);
            }
        }

        if (!allComments.length) {
            container.innerHTML = `<p class="loading">Комментарии недоступны</p>`;
            return;
        }

        // Сортируем по лайкам и оставляем только 6 самых популярных
        allComments.sort((a, b) => b.likes - a.likes);
        const topComments = allComments.slice(0, 6);

        container.innerHTML = topComments.map(c => `
      <a class="comment-item" href="https://www.youtube.com/watch?v=${c.videoId}" target="_blank" rel="noopener">
        <div class="comment-avatar" style="background-image: url('${c.avatar}')"></div>
        <div class="comment-body">
          <div class="comment-author">${c.author}</div>
          <div class="comment-text">${c.text}</div>
          <div class="comment-meta">
            <span class="comment-likes">${formatNumber(c.likes)}</span>
            <span class="comment-source" title="${c.videoTitle}">
              ${c.videoTitle.length > 40 ? c.videoTitle.slice(0, 40) + "…" : c.videoTitle}
            </span>
          </div>
        </div>
      </a>
    `).join("");
    } catch (e) {
        console.error("Ошибка комментариев:", e);
        container.innerHTML = `<p class="loading">Не удалось загрузить комментарии</p>`;
    }
}

// ===== ВИДЖЕТ 5: Последнее видео =====
async function loadLatestVideo() {
    const container = document.getElementById("latest-video");

    try {
        const playlistId = await getUploadsPlaylistId();
        const allVideos = await getAllChannelVideos(playlistId);

        const durationsMap = {};
        for (let i = 0; i < allVideos.length; i += 50) {
            const chunk = allVideos.slice(i, i + 50).map(v => v.id).join(",");
            const chunkDurations = await getVideosDurations(chunk);
            Object.assign(durationsMap, chunkDurations);
        }

        const sorted = allVideos
            .map(v => ({ ...v, duration: durationsMap[v.id] || 0 }))
            .filter(v => v.duration > 70)
            .sort((a, b) => new Date(b.published) - new Date(a.published));

        const latest = sorted[0];
        if (!latest) throw new Error("Видео не найдено");

        const viewsMap = await getVideosStats(latest.id);
        const views = viewsMap[latest.id] || 0;

        container.innerHTML = `
      <a class="latest-link" href="https://www.youtube.com/watch?v=${latest.id}" target="_blank" rel="noopener">
        <img class="video-thumb-large" src="${latest.thumb}" alt="${latest.title}"
             onerror="this.style.background='#e8f5ec'">
        <div class="video-title">${latest.title}</div>
        <div class="video-meta">${formatNumber(views)} просмотров · ${formatDate(latest.published)}</div>
      </a>
    `;
    } catch (e) {
        console.error("Ошибка последнего видео:", e);
        container.innerHTML = `<p class="loading">Не удалось загрузить</p>`;
    }
}

// ===== ВИДЖЕТ 6: Диаграмма вовлечённости =====
let engagementChart = null;

async function loadEngagementChart() {
    try {
        const playlistId = await getUploadsPlaylistId();
        const allVideos = await getAllChannelVideos(playlistId);

        const durationsMap = {};
        for (let i = 0; i < allVideos.length; i += 50) {
            const chunk = allVideos.slice(i, i + 50).map(v => v.id).join(",");
            const chunkDurations = await getVideosDurations(chunk);
            Object.assign(durationsMap, chunkDurations);
        }

        const sorted = allVideos
            .map(v => ({ ...v, duration: durationsMap[v.id] || 0 }))
            .filter(v => v.duration > 70)
            .sort((a, b) => new Date(b.published) - new Date(a.published));

        const latest = sorted[0];
        if (!latest) throw new Error("Видео не найдено");

        const statsUrl = `https://www.googleapis.com/youtube/v3/videos` +
            `?part=statistics&id=${latest.id}&key=${API_KEY}`;
        const statsRes = await fetch(statsUrl);
        const statsData = await statsRes.json();
        const stats = statsData.items?.[0]?.statistics;

        if (!stats) throw new Error("Статистика недоступна");

        const views = parseInt(stats.viewCount || 0, 10);
        const likes = parseInt(stats.likeCount || 0, 10);
        const comments = parseInt(stats.commentCount || 0, 10);

        const canvas = document.getElementById("engagementChart");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (engagementChart) engagementChart.destroy();

        const engaged = likes + comments;
        const passive = Math.max(views - engaged, 0);

        engagementChart = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: ["Лайки", "Комментарии", "Просмотры"],
                datasets: [{
                    data: [likes, comments, passive],
                    backgroundColor: ["#ef4444", "#22c55e", "#d4e8da"],
                    borderWidth: 0,
                    hoverOffset: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: "68%",
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        titleFont: { size: 11, weight: "600" },
                        bodyFont: { size: 10 },
                        padding: 10,
                        cornerRadius: 8,
                        boxPadding: 4,
                        caretSize: 5,
                        callbacks: {
                            label: (ctx) => {
                                const value = ctx.parsed;
                                const percent = ((value / views) * 100).toFixed(2);
                                return `${ctx.label}: ${formatNumber(value)} (${percent}%)`;
                            }
                        }
                    }
                }
            }
        });

        const legendContainer = document.getElementById("chart-legend");
        legendContainer.innerHTML = `
      <div class="chart-legend-item">
        <span class="chart-legend-dot" style="background:#ef4444"></span>
        <span class="chart-legend-label">Лайки</span>
        <span class="chart-legend-value">${formatNumber(likes)}</span>
      </div>
      <div class="chart-legend-item">
        <span class="chart-legend-dot" style="background:#22c55e"></span>
        <span class="chart-legend-label">Комментарии</span>
        <span class="chart-legend-value">${formatNumber(comments)}</span>
      </div>
      <div class="chart-legend-item">
        <span class="chart-legend-dot" style="background:#d4e8da"></span>
        <span class="chart-legend-label">Просмотры</span>
        <span class="chart-legend-value">${formatNumber(views)}</span>
      </div>
      <div class="chart-legend-item">
        <span class="chart-legend-dot" style="background:#1a1a1a"></span>
        <span class="chart-legend-label">Коэффициент вовлеченности</span>
        <span class="chart-legend-value">${((engaged / views) * 100).toFixed(2)}%</span>
      </div>
    `;
    } catch (e) {
        console.error("Ошибка диаграммы:", e);
        const legendContainer = document.getElementById("chart-legend");
        if (legendContainer) {
            legendContainer.innerHTML = `<p class="loading">Не удалось загрузить данные</p>`;
        }
    }
}

// ===== ЗАПУСК =====
loadChannelStats().catch(e => console.error("Stats:", e));
loadTopVideos().catch(e => console.error("Top:", e));
loadLatestVideo().catch(e => console.error("Latest:", e));
loadTopComments().catch(e => console.error("Comments:", e));
loadEngagementChart().catch(e => console.error("Chart:", e));

updateCountdown();
setInterval(updateCountdown, 1000);

setInterval(() => {
    loadChannelStats().catch(e => console.error("Stats:", e));
}, 60_000);

setInterval(() => {
    loadTopVideos().catch(e => console.error("Top:", e));
    loadLatestVideo().catch(e => console.error("Latest:", e));
    loadTopComments().catch(e => console.error("Comments:", e));
    loadEngagementChart().catch(e => console.error("Chart:", e));
}, 600_000);