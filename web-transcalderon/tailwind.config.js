/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./assets/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        brand: {
          light: "#12406B",
          DEFAULT: "#0B2A4A",
          dark: "#071A2E",
        },
        accent: {
          light: "#F6BE6B",
          DEFAULT: "#F2A93B",
          dark: "#D98A1F",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 30px -10px rgba(11, 42, 74, 0.25)",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
