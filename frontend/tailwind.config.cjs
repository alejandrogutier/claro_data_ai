/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        claro: {
          red: "#e30613",
          ink: "#16191d",
          slate: "#5c6370"
        }
      },
      boxShadow: {
        panel: "0 12px 28px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
