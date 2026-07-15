const app = Vue.createApp({
    mixins: Object.values(mixins),
    data() {
        return {
            loading: true,
            hiddenMenu: false,
            showMenuItems: false,
            menuColor: false,
            scrollTop: 0,
            renderers: [],
            theme: localStorage.getItem("theme") || "auto",
        };
    },
    created() {
        window.addEventListener("load", () => {
            this.loading = false;
        });
        if (this.theme === "auto")
            this.isSystemDarkMode() ? this.setDarkMode(true) : this.setDarkMode(false);
        else
            this.theme === "dark" ? this.setDarkMode(true) : this.setDarkMode(false);
        window.addEventListener("beforeunload", () => {
            if (this.theme === "auto")
                localStorage.removeItem("theme");
            else
                localStorage.setItem("theme", this.theme);
        });
    },
    mounted() {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
            if (this.theme === "auto") {
                this.setDarkMode(e.matches);
            }
        });
        window.addEventListener("scroll", this.handleScroll, true);
        this.render();
    },
    methods: {
        render() {
            for (let i of this.renderers) i();
        },
        handleScroll() {
            let wrap = this.$refs.homePostsWrap;
            let newScrollTop = document.documentElement.scrollTop;
            if (this.scrollTop < newScrollTop) {
                this.hiddenMenu = true;
                this.showMenuItems = false;
            } else this.hiddenMenu = false;
            if (wrap) {
                if (newScrollTop <= window.innerHeight - 100) this.menuColor = true;
                else this.menuColor = false;
                if (newScrollTop <= 400) wrap.style.top = "-" + newScrollTop / 5 + "px";
                else wrap.style.top = "-80px";
            }
            this.scrollTop = newScrollTop;
        },
        isSystemDarkMode() {
            return window.matchMedia("(prefers-color-scheme: dark)").matches;
        },
        setDarkMode(dark) {
            if (dark) {
                document.documentElement.classList.add("dark");
                const darkStyle = document.getElementById("highlight-style-dark");
                if (darkStyle) darkStyle.removeAttribute("disabled");
            } else {
                document.documentElement.classList.remove("dark");
                const darkStyle = document.getElementById("highlight-style-dark");
                if (darkStyle) darkStyle.setAttribute("disabled", "");
            }
        },
        handleThemeSwitch() {
            this.theme = ((theme) => {
                switch (theme) {
                case "auto":
                    this.setDarkMode(false);
                    return "light";
                case "light":
                    this.setDarkMode(true);
                    return "dark";
                case "dark":
                    this.isSystemDarkMode() ? this.setDarkMode(true) : this.setDarkMode(false);
                    return "auto";
                }
            })(this.theme);
        },
    },
});
app.mount("#layout");
