/**
 * 音乐播放器 - 基于 APlayer + MetingJS
 * 功能: 左下/右下切换 / 跨页同步
 * 配置: source/_data/player.yml
 */
(function () {
    'use strict';

    // ==================== 默认配置 ====================
    var DEFAULTS = {
        audio: { server: 'netease', type: 'playlist', id: '2829883282', theme: '#49b1f5' },
        behavior: { autoplay: false, loop: 'all', order: 'random', preload: 'auto', default_volume: 0.7, remember_progress: true, progress_tolerance: 0.5 },
        ui: { mode: 'fixed', mini: true, list_folded: true, edge_margin: 15 },
        sync: { enable: true, storage_key: 'blog_player_state' },
        responsive: { mobile_breakpoint: 768, watch_breakpoint: 480 }
    };

    // ==================== 工具函数 ====================
    function deepMerge(target, source) {
        var result = {};
        for (var key in target) {
            if (!target.hasOwnProperty(key)) continue;
            if (source && source.hasOwnProperty(key) && typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])) {
                result[key] = deepMerge(target[key], source[key]);
            } else if (source && source.hasOwnProperty(key)) {
                result[key] = source[key];
            } else {
                result[key] = target[key];
            }
        }
        if (source) {
            for (var sk in source) {
                if (source.hasOwnProperty(sk) && !result.hasOwnProperty(sk)) result[sk] = source[sk];
            }
        }
        return result;
    }

    function storageGet(key) {
        try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
    }

    function storageSet(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    var CONFIG = deepMerge(DEFAULTS, window.__PLAYER_CONFIG__ || {});

    // ==================== 全局状态 ====================
    var ap = null;
    var apEl = null;
    var isReady = false;
    var isLeft = true; // 当前在左还是右

    // ==================== 播放器初始化 ====================
    function initPlayer() {
        var meting = document.createElement('meting-js');
        meting.setAttribute('server', CONFIG.audio.server);
        meting.setAttribute('type', CONFIG.audio.type);
        meting.setAttribute('id', CONFIG.audio.id);
        meting.setAttribute('fixed', CONFIG.ui.mode === 'fixed' ? 'true' : 'false');
        meting.setAttribute('mini', CONFIG.ui.mini ? 'true' : 'false');
        meting.setAttribute('autoplay', CONFIG.behavior.autoplay ? 'true' : 'false');
        meting.setAttribute('loop', CONFIG.behavior.loop);
        meting.setAttribute('order', CONFIG.behavior.order);
        meting.setAttribute('preload', CONFIG.behavior.preload);
        meting.setAttribute('list-folded', CONFIG.ui.list_folded ? 'true' : 'false');
        meting.setAttribute('lrc-type', '3');
        meting.setAttribute('theme', CONFIG.audio.theme);
        document.body.appendChild(meting);

        var checkCount = 0;
        var checkTimer = setInterval(function () {
            var el = document.querySelector('.aplayer');
            checkCount++;
            if (el) {
                clearInterval(checkTimer);
                apEl = el;
                ap = el.aplayer || el._aplayer || null;
                onReady();
            } else if (checkCount > 50) {
                clearInterval(checkTimer);
            }
        }, 100);
    }

    function onReady() {
        if (isReady) return;
        isReady = true;

        initSync();
        initResponsive();

        // 延迟恢复状态，等 APlayer 列表加载完毕
        setTimeout(function () {
            if (ap && ap.audio) {
                // 先设默认音量，restoreState 会覆盖
                ap.audio.volume = CONFIG.behavior.default_volume;
            }
            restoreState();
        }, 600);
    }

    // ==================== 跨页面同步 ====================
    function saveState() {
        if (!isReady || !ap || !CONFIG.sync.enable) return;
        var list = ap.list;
        var audio = ap.audio;
        if (!list || !audio) return;

        storageSet(CONFIG.sync.storage_key, {
            currentIndex: list.audios ? list.audios.indexOf(audio) : (list.index || 0),
            currentTime: audio.currentTime || 0,
            volume: audio.volume,
            muted: audio.muted || false,
            isPlaying: !audio.paused,
            loop: list.loop || 'all',
            order: list.order || 'list',
            timestamp: Date.now()
        });
    }

    function restoreState() {
        if (!CONFIG.sync.enable) return;
        var state = storageGet(CONFIG.sync.storage_key);
        if (!state || !ap) return;

        var audio = ap.audio;
        var list = ap.list;
        if (!audio || !list) return;

        // 恢复音量
        if (typeof state.volume === 'number') {
            audio.volume = Math.max(0, Math.min(1, state.volume));
        }
        if (state.muted) audio.muted = true;

        // 恢复播放模式
        try {
            if (state.loop) list.loop = state.loop;
            if (state.order) list.order = state.order;
        } catch (e) {}

        // 恢复播放进度
        if (!CONFIG.behavior.remember_progress) return;
        if (typeof state.currentIndex !== 'number' || state.currentIndex < 0) return;

        try {
            list.switch(state.currentIndex);
        } catch (e) { return; }

        if (!state.currentTime || state.currentTime <= 0) return;

        /** 尝试设置播放进度，多次重试直到成功 */
        function seekToTime(retries) {
            if (!audio || !audio.duration) {
                if (retries > 0) setTimeout(function () { seekToTime(retries - 1); }, 300);
                return;
            }
            try {
                audio.currentTime = state.currentTime;
            } catch (e) {}
            if (state.isPlaying) {
                try { ap.play(); } catch (e) {}
            }
        }
        seekToTime(10);
    }

    function initSync() {
        if (!CONFIG.sync.enable) return;

        // 页面离开时保存（pagehide 比 beforeunload 更可靠）
        window.addEventListener('pagehide', saveState);
        window.addEventListener('beforeunload', saveState);

        // 每 5 秒保存一次播放进度
        setInterval(function () {
            if (isReady && ap && ap.audio && !ap.audio.paused) saveState();
        }, 5000);

        // 暂停/播放/切歌/音量变化时立即保存
        if (ap) {
            try {
                ap.on('pause', saveState);
                ap.on('play', saveState);
                ap.on('listswitch', function () { setTimeout(saveState, 200); });
                if (ap.audio) {
                    ap.audio.addEventListener('volumechange', saveState);
                    ap.audio.addEventListener('timeupdate', function () {
                        // 每 10 秒保存一次进度（节流）
                        if (!ap.audio._lastSaveTime || Date.now() - ap.audio._lastSaveTime > 10000) {
                            ap.audio._lastSaveTime = Date.now();
                            saveState();
                        }
                    });
                }
            } catch (e) {}
        }

        // 页面隐藏时保存
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) saveState();
        });
    }

    // ==================== 响应式 ====================
    function initResponsive() {
        checkResponsive();
        window.addEventListener('resize', function () {
            setTimeout(checkResponsive, 200);
        });
    }

    function checkResponsive() {
        if (!apEl) return;
        var w = window.innerWidth;
        if (w <= CONFIG.responsive.watch_breakpoint) {
            apEl.classList.add('player-watch-mode');
        } else {
            apEl.classList.remove('player-watch-mode');
        }
    }

    // ==================== 启动 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlayer);
    } else {
        initPlayer();
    }
})();

/**
 * 文章目录生成与跳转
 * 功能: 自动解析文章标题生成目录 / 滚动高亮当前章节 / 点击平滑跳转
 */
(function () {
    'use strict';

    /**
     * 初始化文章目录
     * 解析 .article .content 中的 h1-h6 标题，生成嵌套目录并绑定交互
     */
    function initTOC() {
        var content = document.querySelector('.article .content');
        if (!content) return;

        var headings = content.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headings.length < 2) return; // 少于2个标题不显示目录

        var tocContent = document.getElementById('toc-content');
        var tocSidebar = document.getElementById('toc-sidebar');
        if (!tocContent || !tocSidebar) return;

        // 计算最小标题级别，用于统一缩进基准
        var minLevel = 6;
        headings.forEach(function (h) {
            var level = parseInt(h.tagName.charAt(1));
            if (level < minLevel) minLevel = level;
        });

        // 生成目录 HTML
        var tocHTML = '<ul class="toc-list">';
        headings.forEach(function (h, index) {
            var level = parseInt(h.tagName.charAt(1));
            var indent = level - minLevel;
            var text = h.textContent.trim();

            // 为标题添加锚点 ID
            if (!h.id) {
                h.id = 'toc-heading-' + index;
            }

            tocHTML += '<li class="toc-item toc-level-h' + level + '" style="padding-left: ' + (indent * 16) + 'px;">';
            tocHTML += '<a href="#' + h.id + '" class="toc-link" title="' + text + '">' + text + '</a>';
            tocHTML += '</li>';
        });
        tocHTML += '</ul>';

        tocContent.innerHTML = tocHTML;
        tocSidebar.style.display = 'block';

        // 收集标题元素引用
        var headingElements = [];
        headings.forEach(function (h) { headingElements.push(h); });
        var tocLinks = tocContent.querySelectorAll('.toc-link');

        /**
         * 滚动监听：根据当前滚动位置高亮对应目录项
         */
        function updateActiveLink() {
            var scrollTop = window.scrollY || document.documentElement.scrollTop;
            var activeIndex = -1;

            // 从后往前找第一个在视口上方的标题
            for (var i = headingElements.length - 1; i >= 0; i--) {
                if (headingElements[i].offsetTop - 120 <= scrollTop) {
                    activeIndex = i;
                    break;
                }
            }

            tocLinks.forEach(function (link, i) {
                if (i === activeIndex) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        }

        window.addEventListener('scroll', updateActiveLink, { passive: true });
        updateActiveLink();

        /**
         * 点击目录项平滑滚动到对应章节
         */
        tocContent.addEventListener('click', function (e) {
            var link = e.target.closest('.toc-link');
            if (!link) return;
            e.preventDefault();

            var targetId = link.getAttribute('href').substring(1);
            var target = document.getElementById(targetId);
            if (target) {
                var offset = target.offsetTop - 80;
                window.scrollTo({ top: offset, behavior: 'smooth' });
                // 手机端：点击目录项后自动收起侧边栏
                closeMobileTOC();
            }
        });

        // ==================== 手机端目录展开/收起逻辑 ====================
        var tocMobileBtn = document.getElementById('toc-mobile-btn');
        var tocMobileCurtain = document.getElementById('toc-mobile-curtain');
        var isTOCOpen = false;

        /** 打开手机端目录侧边栏 */
        function openMobileTOC() {
            if (isTOCOpen) return;
            isTOCOpen = true;
            tocSidebar.classList.remove('mobile-closing');
            tocSidebar.classList.remove('collapsed');
            tocSidebar.style.display = '';
            tocSidebar.classList.add('mobile-open');
            tocMobileCurtain.classList.add('show');
            tocMobileBtn.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        /** 关闭手机端目录侧边栏 */
        function closeMobileTOC() {
            if (!isTOCOpen) return;
            isTOCOpen = false;
            tocSidebar.classList.add('mobile-closing');
            tocMobileCurtain.classList.remove('show');
            tocMobileBtn.classList.remove('open');
            document.body.style.overflow = '';

            setTimeout(function () {
                tocSidebar.classList.remove('mobile-open');
                tocSidebar.classList.remove('mobile-closing');
                tocSidebar.classList.remove('collapsed');
            }, 260);
        }

        /** 切换目录展开/收起 */
        function toggleMobileTOC() {
            if (isTOCOpen) {
                closeMobileTOC();
            } else {
                openMobileTOC();
            }
        }

        

        // 点击遮罩层关闭
        if (tocMobileCurtain) {
            tocMobileCurtain.addEventListener('click', closeMobileTOC);
        }

        // 窗口大小变化时，如果从手机端切换到桌面端，自动关闭手机目录
        window.addEventListener('resize', function () {
            if (window.innerWidth > 900 && isTOCOpen) {
                closeMobileTOC();
            }
        });

        // ==================== 电脑端目录收起逻辑 ====================
        var tocCollapseBtn = document.getElementById('toc-collapse-btn');
        var isTOCCollapsed = false;

        /** 收起电脑端目录侧边栏，显示手机端展开按钮 */
        function collapseDesktopTOC() {
            if (isTOCCollapsed) return;
            isTOCCollapsed = true;
            tocSidebar.classList.add('collapsed');
            tocMobileBtn.classList.remove('open');
            setTimeout(function () {
                tocSidebar.style.display = 'none';
                tocMobileBtn.classList.add('show');
            }, 300);
        }

        /** 展开电脑端目录侧边栏，隐藏手机端按钮 */
        function expandDesktopTOC() {
            if (!isTOCCollapsed) return;
            isTOCCollapsed = false;
            tocMobileBtn.classList.remove('show');
            tocSidebar.style.display = 'block';
            tocSidebar.offsetHeight;
            tocSidebar.classList.remove('collapsed');
            tocSidebar.classList.remove('mobile-open');
            tocSidebar.classList.remove('mobile-closing');
            tocMobileCurtain.classList.remove('show');
            tocMobileBtn.classList.remove('open');
            document.body.style.overflow = '';
        }

        // 点击收起按钮
        if (tocCollapseBtn) {
            tocCollapseBtn.addEventListener('click', function () {
                collapseDesktopTOC();
            });
        }

        // 点击手机端展开按钮（在桌面端收起后），展开电脑端目录
        tocMobileBtn.addEventListener('click', function () {
            if (window.innerWidth > 900 && isTOCCollapsed) {
                expandDesktopTOC();
            } else {
                toggleMobileTOC();
            }
        });
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTOC);
    } else {
        initTOC();
    }
})();

/**
 * 瀑布流相册 - 懒加载 + 分类筛选
 * 功能: 图片滚动懒加载 / 分类按钮筛选
 */
(function () {
    'use strict';

    var galleryContainer = document.getElementById('gallery-container');
    if (!galleryContainer) return;

    var galleryItems = galleryContainer.querySelectorAll('.gallery-item');
    var lazyImages = galleryContainer.querySelectorAll('.gallery-img.lazy');
    var catButtons = document.querySelectorAll('.gallery-cat-btn');

    /**
     * 判断元素是否在可视区域内
     * @param {HTMLElement} el - 要检查的元素
     * @returns {boolean} 是否可见
     */
    function isInViewport(el) {
        var rect = el.getBoundingClientRect();
        return rect.top <= window.innerHeight + 200 && rect.bottom >= -200;
    }

    /**
     * 加载单张图片：将 data-src 赋值给 src
     * @param {HTMLImageElement} img - 图片元素
     */
    function loadImage(img) {
        var src = img.getAttribute('data-src');
        if (!src) return;
        img.src = src;
        img.classList.remove('lazy');
        img.addEventListener('load', function () {
            img.style.opacity = '1';
        });
    }

    /** 滚动时检查并加载可见图片 */
    function checkImages() {
        lazyImages.forEach(function (img) {
            if (img.classList.contains('lazy') && isInViewport(img)) {
                loadImage(img);
            }
        });
    }

    // 初始加载可见图片
    checkImages();

    // 滚动监听
    var scrollTimer;
    window.addEventListener('scroll', function () {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(checkImages, 100);
    }, { passive: true });

    /**
     * 分类筛选：点击分类按钮显示/隐藏对应图片
     */
    if (catButtons.length > 0) {
        catButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var category = this.getAttribute('data-category');

                // 更新按钮激活状态
                catButtons.forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');

                // 筛选图片
                galleryItems.forEach(function (item) {
                    if (category === 'all' || item.getAttribute('data-category') === category) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });

                // 筛选后重新检查懒加载
                setTimeout(checkImages, 50);
            });
        });
    }
})();